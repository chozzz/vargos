/**
 * SSH terminal backend — routes the Pi SDK's built-in tool operations to a
 * remote host over one multiplexed `ssh2` connection (exec for bash + remote
 * shell helpers, SFTP for file ops).
 *
 * Design notes:
 * - One `ssh2.Client` per backend instance (one per remote channel session).
 *   Key auth only (BatchMode-equivalent: no password prompt), keepalive on,
 *   transparent reconnect on dropped connections (operations re-establish).
 * - File ops go through SFTP (binary-safe, no shell quoting). Paths are
 *   absolute on the remote host — the Pi tool definitions are built with the
 *   remote cwd, so relative tool paths resolve to remote paths before they
 *   reach the operations.
 * - `find.glob` walks the remote tree via SFTP readdir and matches the collected
 *   relative paths with minimatch — no reliance on remote `fd`.
 * - grep is intentionally not overridden (the SDK's grep always spawns a
 *   local `rg`); remote channels register tools without grep.
 */

import { readFileSync } from 'node:fs';
import { join as posixJoin } from 'node:path/posix';
import { Client, type SFTPWrapper, type Stats, type FileEntryWithStats } from 'ssh2';
import { minimatch } from 'minimatch';
import { createLogger } from '../../../lib/logger.js';
import type { SshTerminalSpec } from '../../../lib/terminal.js';
import { detectImageMimeType } from './image-mime.js';
import type { TerminalBackend } from './types.js';

const log = createLogger('agent-terminal-ssh');

const CONNECT_TIMEOUT_MS = 10_000;
const KEEPALIVE_INTERVAL_MS = 30_000;
const KEEPALIVE_COUNT_MAX = 3;

/** Remote tree walk caps for find.glob (SFTP readdir is one RTT per dir). */
const MAX_GLOB_FILES = 20_000;
const MAX_GLOB_DEPTH = 16;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** Single-quote a string for safe interpolation into a remote shell command. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export class SshBackend implements TerminalBackend {
  readonly spec: SshTerminalSpec;

  private client: Client | null = null;
  private sftp: SFTPWrapper | null = null;
  private connectPromise: Promise<void> | undefined;
  private resolvedCwd: string | undefined;
  private keyPath: string | undefined;

  constructor(spec: SshTerminalSpec) {
    this.spec = spec;
    this.keyPath = spec.keyPath;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Connect (idempotent); fails fast on auth/host errors. */
  async connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.doConnect().catch((err) => {
        this.connectPromise = undefined; // allow retry after a failed attempt
        throw err;
      });
    }
    return this.connectPromise;
  }

  private async doConnect(): Promise<void> {
    if (this.client) return; // non-null = connection alive (error/close handlers null it)
    const { user, host, port } = this.spec;
    const conn = new Client();
    this.client = conn;
    this.sftp = null;

    const connected = await new Promise<void>((resolve, reject) => {
      conn.once('ready', resolve);
      conn.once('error', reject);
      conn.connect({
        host,
        port,
        username: user,
        ...(this.keyPath !== undefined && { privateKey: readFileSync(this.keyPath) }),
        readyTimeout: CONNECT_TIMEOUT_MS,
        keepaliveInterval: KEEPALIVE_INTERVAL_MS,
        keepaliveCountMax: KEEPALIVE_COUNT_MAX,
      });
    });

    // After the initial connection, mark as dropped and let the next op reconnect.
    conn.on('error', () => {
      if (this.client === conn) {
        this.client = null;
        this.sftp = null;
        this.connectPromise = undefined;
        log.warn(`ssh ${user}@${host}:${port} connection dropped`);
      }
    });
    conn.on('close', () => {
      if (this.client === conn) {
        this.client = null;
        this.sftp = null;
        this.connectPromise = undefined;
      }
    });

    this.sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
    });
    log.info(`ssh ${user}@${host}:${port} connected`);
    void connected;
  }

  async dispose(): Promise<void> {
    const client = this.client;
    const sftp = this.sftp;
    this.client = null;
    this.sftp = null;
    this.connectPromise = undefined;
    if (sftp) {
      try { sftp.end(); } catch { /* already closed */ }
    }
    if (client) {
      try { client.end(); } catch { /* already closed */ }
    }
  }

  /** Resolve the remote working directory ($HOME for omitted / ~ paths). */
  async resolveCwd(): Promise<string> {
    if (this.resolvedCwd) return this.resolvedCwd;
    const specCwd = this.spec.cwd;
    if (specCwd === undefined || specCwd === '~' || specCwd.startsWith('~/')) {
      const home = (await this.execCapture('printf %s "$HOME"')).trim();
      this.resolvedCwd = specCwd === undefined || specCwd === '~' ? home : posixJoin(home, specCwd.slice(2));
    } else {
      this.resolvedCwd = specCwd;
    }
    return this.resolvedCwd;
  }

  // ── Pi SDK operations ──────────────────────────────────────────────────────

  readonly bash = {
    exec: async (
      command: string,
      cwd: string,
      options: { onData: (data: Buffer) => void; signal?: AbortSignal; timeout?: number; env?: NodeJS.ProcessEnv },
    ) => {
      const client = await this.ensureClient();
      const { onData, signal, timeout, env } = options;
      if (signal?.aborted) throw new Error('aborted');

      const remoteCmd = `cd -- ${shq(cwd)} && ( ${command} )`;

      return new Promise<{ exitCode: number | null }>((resolve, reject) => {
        let settled = false;
        let killed = false;
        let timer: NodeJS.Timeout | undefined;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          if (settled) return;
          killed = true;
          cleanup();
          reject(new Error('aborted'));
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });

        if (timeout !== undefined) {
          if (!Number.isFinite(timeout) || timeout <= 0) {
            cleanup();
            return reject(new Error('Invalid timeout: must be a finite number of seconds'));
          }
          timer = setTimeout(() => {
            if (settled) return;
            killed = true;
            cleanup();
            reject(new Error(`timeout:${timeout}`));
          }, timeout * 1000);
        }

        client.exec(remoteCmd, { ...(env && { env }) }, (err: Error | undefined, stream) => {
          if (err) {
            if (!settled) {
              settled = true;
              cleanup();
              reject(err);
            }
            return;
          }
          stream.on('data', (d: Buffer) => onData(d));
          stream.stderr?.on('data', (d: Buffer) => onData(d));
          stream.on('close', (code: number | null) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (killed) return; // timeout/abort already rejected
            resolve({ exitCode: code });
          });
          stream.on('error', (err: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          });
        });
      });
    },
  };

  readonly read = {
    readFile: async (absolutePath: string): Promise<Buffer> => {
      const sftp = await this.ensureSftp();
      return new Promise<Buffer>((resolve, reject) => {
        let buf = Buffer.alloc(0);
        const rs = sftp.createReadStream(absolutePath);
        rs.on('data', (d: Buffer) => { buf = Buffer.concat([buf, d]); });
        rs.on('error', reject);
        rs.on('end', () => resolve(buf));
      });
    },

    access: async (absolutePath: string): Promise<void> => {
      const sftp = await this.ensureSftp();
      await new Promise<void>((resolve, reject) => {
        sftp.stat(absolutePath, (err) => (err ? reject(err) : resolve()));
      });
    },

    detectImageMimeType: async (absolutePath: string): Promise<string | null> => {
      const sftp = await this.ensureSftp();
      try {
        const head = await new Promise<Buffer>((resolve, reject) => {
          let buf = Buffer.alloc(0);
          const rs = sftp.createReadStream(absolutePath, { start: 0, end: 11 });
          rs.on('data', (d: Buffer) => { buf = Buffer.concat([buf, d]); });
          rs.on('error', reject);
          rs.on('end', () => resolve(buf));
        });
        return detectImageMimeType(head);
      } catch {
        return null;
      }
    },
  };

  readonly write = {
    writeFile: async (absolutePath: string, content: string): Promise<void> => {
      const sftp = await this.ensureSftp();
      await new Promise<void>((resolve, reject) => {
        const ws = sftp.createWriteStream(absolutePath);
        ws.on('error', reject);
        ws.on('close', resolve);
        ws.end(content);
      });
    },

    mkdir: async (dir: string): Promise<void> => {
      await this.execCapture(`mkdir -p -- ${shq(dir)}`);
    },
  };

  readonly edit = {
    readFile: (p: string) => this.read.readFile(p),
    writeFile: (p: string, content: string) => this.write.writeFile(p, content),
    access: (p: string) => this.read.access(p),
  };

  readonly find = {
    exists: async (absolutePath: string): Promise<boolean> => {
      const sftp = await this.ensureSftp();
      try {
        await new Promise<void>((resolve, reject) => {
          sftp.stat(absolutePath, (err) => (err ? reject(err) : resolve()));
        });
        return true;
      } catch {
        return false;
      }
    },

    glob: async (pattern: string, cwd: string, options: { ignore: string[]; limit: number }): Promise<string[]> => {
      const files = await this.walkRemoteFiles(cwd);
      const hasSlash = pattern.includes('/');
      const ignoreAll = [...options.ignore, 'node_modules/**', '.git/**'];
      const matches = files.filter(f =>
        minimatch(f, pattern, { dot: true })
        // fd-style: a slash-less pattern matches by basename anywhere in the tree
        || (!hasSlash && minimatch(f.split('/').pop() ?? '', pattern, { dot: true })),
      );
      return matches
        .filter(f => !ignoreAll.some(ip => minimatch(f, ip, { dot: true })))
        .slice(0, options.limit);
    },
  };

  readonly ls = {
    exists: async (absolutePath: string): Promise<boolean> => {
      const sftp = await this.ensureSftp();
      try {
        await new Promise<void>((resolve, reject) => {
          sftp.stat(absolutePath, (err) => (err ? reject(err) : resolve()));
        });
        return true;
      } catch {
        return false;
      }
    },

    stat: async (absolutePath: string): Promise<{ isDirectory: () => boolean }> => {
      const sftp = await this.ensureSftp();
      const stats: Stats = await new Promise((resolve, reject) => {
        sftp.stat(absolutePath, (err, s) => (err ? reject(err) : resolve(s!)));
      });
      return { isDirectory: () => stats.isDirectory() };
    },

    readdir: async (absolutePath: string): Promise<string[]> => {
      const sftp = await this.ensureSftp();
      const entries = await new Promise<string[]>((resolve, reject) => {
        sftp.readdir(absolutePath, (err, list) => (err ? reject(err) : resolve(list.map(e => e.filename))));
      });
      return entries;
    },
  };

  // ── Internals ──────────────────────────────────────────────────────────────

  private async ensureClient(): Promise<Client> {
    await this.connect();
    const client = this.client;
    if (!client) throw new Error('ssh connection not established');
    return client;
  }

  private async ensureSftp(): Promise<SFTPWrapper> {
    await this.connect();
    const sftp = this.sftp;
    if (!sftp) throw new Error('sftp session not established');
    return sftp;
  }

  /** Run a helper command on the remote host; returns stdout (resolves on exit 0). */
  private async execCapture(command: string): Promise<string> {
    const client = await this.ensureClient();
    return new Promise<string>((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);
        const out: Buffer[] = [];
        const errOut: Buffer[] = [];
        stream.on('data', (d: Buffer) => out.push(d));
        stream.stderr?.on('data', (d: Buffer) => errOut.push(d));
        stream.on('close', (code: number | null) => {
          if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
          else reject(new Error(`remote command failed (${code}): ${Buffer.concat(errOut).toString('utf8').trim()}`));
        });
      });
    });
  }

  /** Recursively list relative file paths under a remote directory (capped). */
  private async walkRemoteFiles(cwd: string): Promise<string[]> {
    const sftp = await this.ensureSftp();
    const files: string[] = [];

    const walk = async (remoteDir: string, rel: string, depth: number): Promise<void> => {
      if (files.length >= MAX_GLOB_FILES) return;
      const entries = await new Promise<FileEntryWithStats[]>((resolve, reject) => {
        sftp.readdir(remoteDir, (err, list) => (err ? reject(err) : resolve(list)));
      }).catch(() => [] as FileEntryWithStats[]);
      for (const entry of entries) {
        if (files.length >= MAX_GLOB_FILES) return;
        const { filename: name, attrs } = entry;
        const relPath = rel ? `${rel}/${name}` : name;
        if (attrs.isDirectory()) {
          if (depth < MAX_GLOB_DEPTH && !SKIP_DIRS.has(name) && !name.startsWith('.')) {
            await walk(`${remoteDir}/${name}`, relPath, depth + 1);
          }
        } else if (!attrs.isSymbolicLink()) {
          files.push(relPath);
        }
      }
    };

    await walk(cwd, '', 0);
    return files;
  }
}
