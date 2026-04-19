import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { getDataPaths } from '../../lib/paths.js';
import { detectMimeType } from '../../lib/mime.js';
import { toMessage } from '../../lib/error.js';
import { withTimeout } from '../../lib/timeout.js';

export class FsService {
  @register('fs.read', {
    description: 'Read a file. Returns content and mimeType. Supports text and images.',
    schema: z.object({
      path:   z.string().describe('Absolute or ~-relative path'),
      offset: z.number().optional().describe('Start line (1-indexed)'),
      limit:  z.number().optional().describe('Max lines to read'),
    }),
  })
  async read(params: EventMap['fs.read']['params']): Promise<EventMap['fs.read']['result']> {
    const filePath = resolvePath(params.path);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(`Not a file: ${params.path}`);
    if (stat.size > 5 * 1024 * 1024) throw new Error(`File too large (${Math.round(stat.size / 1024 / 1024)}MB). Use offset/limit.`);

    const buf      = await fs.readFile(filePath);
    const mimeType = await detectMimeType(buf);

    if (mimeType.startsWith('image/'))
      return { content: buf.toString('base64'), mimeType };

    let text = buf.toString('utf-8');
    if (params.offset !== undefined || params.limit !== undefined) {
      const lines  = text.split('\n');
      const offset = (params.offset ?? 1) - 1;
      text = lines.slice(offset, offset + (params.limit ?? lines.length)).join('\n');
    }
    return { content: text, mimeType };
  }

  @register('fs.write', {
    description: 'Write content to a file (creates parent dirs as needed).',
    schema: z.object({
      path:    z.string(),
      content: z.string(),
    }),
  })
  async write(params: EventMap['fs.write']['params']): Promise<void> {
    const filePath = resolvePath(params.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, params.content, 'utf-8');
  }

  @register('fs.edit', {
    description: 'Replace an exact string in a file. Fails if 0 or >1 matches.',
    schema: z.object({
      path:    z.string(),
      oldText: z.string().describe('Exact text to replace'),
      newText: z.string().describe('Replacement text'),
    }),
  })
  async edit(params: EventMap['fs.edit']['params']): Promise<void> {
    const filePath = resolvePath(params.path);
    const content  = await fs.readFile(filePath, 'utf-8');
    const count    = content.split(params.oldText).length - 1;
    if (count === 0) throw new Error(`Text not found in ${params.path}`);
    if (count > 1)   throw new Error(`Found ${count} occurrences — be more specific`);
    await fs.writeFile(filePath, content.replace(params.oldText, params.newText), 'utf-8');
  }

  @register('fs.exec', {
    description: 'Run a shell command. Returns stdout, stderr, exitCode.',
    schema: z.object({
      command: z.string(),
      timeout: z.number().optional().describe('Timeout ms (default 60000)'),
    }),
  })
  async exec(params: EventMap['fs.exec']['params']): Promise<EventMap['fs.exec']['result']> {
    const dangerous = ['rm -rf /', '> /dev/', 'mkfs.', 'dd if='];
    for (const p of dangerous) {
      if (params.command.includes(p)) throw new Error(`Blocked: ${p}`);
    }

    const { workspaceDir } = getDataPaths();
    return execShell(params.command, workspaceDir, params.timeout ?? 60_000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePath(inputPath: string): string {
  const expanded = inputPath.startsWith('~')
    ? path.join(os.homedir(), inputPath.slice(1))
    : inputPath;
  return path.resolve(expanded);
}

function sanitizeOutput(s: string): string {
  // Remove ANSI escape codes
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][0-9;]*\x07/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x00]/g, '');
}

function execShell(command: string, cwd: string, timeoutMs: number): Promise<EventMap['fs.exec']['result']> {
  const spawnPromise = new Promise<EventMap['fs.exec']['result']>((resolve) => {
    const child   = spawn('bash', ['-c', command], { cwd, env: process.env });
    let stdout = '', stderr = '';
    let killed = false;

    const timer = setTimeout(() => { killed = true; child.kill('SIGTERM'); }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => { if (stdout.length < 100_000) stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 100_000) stderr += d.toString(); });

    const done = (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
        exitCode: code ?? (killed ? -1 : 0),
      });
    };

    child.on('close', done);
    child.on('error', (e) => { stderr += `\nProcess error: ${toMessage(e)}`; done(-1); });
  });

  return withTimeout(spawnPromise, timeoutMs, `Shell command timeout after ${timeoutMs}ms`).catch((err) => {
    if (err.message.includes('timeout')) {
      return { stdout: '', stderr: `Error: ${err.message}`, exitCode: -1 };
    }
    throw err;
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  bus.bootstrap(new FsService());
  return {};
}
