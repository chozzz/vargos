/**
 * SshBackend live integration test — runs against a real host.
 *
 * Skipped by default; enable with:
 *   VARGOS_TEST_SSH_HOST=192.0.2.206 VARGOS_TEST_SSH_KEY=~/.ssh/id_remote pnpm vitest run services/agent/__tests__/terminal-ssh
 *
 * VARGOS_TEST_SSH_USER (default root) · VARGOS_TEST_SSH_PORT (default 22).
 */

import { homedir } from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SshBackend } from '../terminal/ssh.js';
import { createRemoteGrepToolDefinition } from '../terminal/remote-grep.js';
import { parseTerminalSpec } from '../../../lib/terminal.js';

const HOST = process.env.VARGOS_TEST_SSH_HOST;
const USER = process.env.VARGOS_TEST_SSH_USER ?? 'root';
const PORT = Number(process.env.VARGOS_TEST_SSH_PORT ?? 22);
const KEY = process.env.VARGOS_TEST_SSH_KEY ? (process.env.VARGOS_TEST_SSH_KEY.startsWith('~') ? `${homedir()}/${process.env.VARGOS_TEST_SSH_KEY.slice(1)}` : process.env.VARGOS_TEST_SSH_KEY) : undefined;

describe.skipIf(!HOST)('SshBackend (live: ' + HOST + ')', () => {
  let backend: SshBackend;
  let tmpCwd: string;

  beforeAll(async () => {
    backend = new SshBackend({ kind: 'ssh', user: USER, host: HOST, port: PORT, ...(KEY && { keyPath: KEY }) });
    await backend.connect();
    const home = (await backend.resolveCwd()).trim();
    tmpCwd = `${home}/vargos-ssh-test-${process.pid}`;
    await backend.write.mkdir(tmpCwd);
  });

  afterAll(async () => {
    try {
      await backend.bash.exec(`rm -rf ${JSON.stringify(tmpCwd)}`, tmpCwd, { onData: () => { } });
    } catch { /* best effort */ }
    await backend.dispose();
  });

  it('resolves $HOME and ~ paths on the remote host', async () => {
    const b = new SshBackend({ kind: 'ssh', user: USER, host: HOST, port: PORT, ...(KEY && { keyPath: KEY }) });
    await b.connect();
    try {
      expect(await b.resolveCwd()).toMatch(/^\/[^/]+/);
    } finally {
      await b.dispose();
    }
  });

  it('bash exec runs in the given cwd and streams stdout+stderr', async () => {
    const chunks: Buffer[] = [];
    const { exitCode } = await backend.bash.exec('pwd && echo out && echo err >&2', tmpCwd, {
      onData: d => chunks.push(d),
    });
    expect(exitCode).toBe(0);
    const out = Buffer.concat(chunks).toString();
    expect(out).toContain(tmpCwd);
    expect(out).toContain('out');
    expect(out).toContain('err');
  });

  it('bash exec reports non-zero exit codes without throwing', async () => {
    const { exitCode } = await backend.bash.exec('exit 3', tmpCwd, { onData: () => { } });
    expect(exitCode).toBe(3);
  });

  it('bash exec honors the timeout (seconds) and rejects', async () => {
    await expect(
      backend.bash.exec('sleep 10', tmpCwd, { onData: () => { }, timeout: 1 }),
    ).rejects.toThrow('timeout:1');
  });

  it('write + read round-trip binary-safe content', async () => {
    const p = `${tmpCwd}/roundtrip.txt`;
    const content = 'hello chans\nline two with ünïcode ✓';
    await backend.write.writeFile(p, content);
    const data = await backend.read.readFile(p);
    expect(data.toString('utf8')).toBe(content);
  });

  it('read.access throws for missing files', async () => {
    await expect(backend.read.access(`${tmpCwd}/missing.txt`)).rejects.toThrow();
  });

  it('edit ops read and rewrite a file', async () => {
    const p = `${tmpCwd}/edit.txt`;
    await backend.write.writeFile(p, 'original');
    expect((await backend.edit.readFile(p)).toString()).toBe('original');
    await backend.edit.access(p);
    await backend.edit.writeFile(p, 'updated');
    expect((await backend.edit.readFile(p)).toString()).toBe('updated');
  });

  it('find.glob matches patterns over the remote tree', async () => {
    await backend.write.writeFile(`${tmpCwd}/a.ts`, '');
    await backend.write.writeFile(`${tmpCwd}/b.ts`, '');
    await backend.write.writeFile(`${tmpCwd}/skip.log`, '');

    const files = await backend.find.glob('**/*.ts', tmpCwd, { ignore: [], limit: 10 });
    expect(files.sort()).toEqual(['a.ts', 'b.ts']);

    expect(await backend.find.exists(tmpCwd)).toBe(true);
    expect(await backend.find.exists(`${tmpCwd}/nope`)).toBe(false);
  });

  it('ls ops stat and list remote directories', async () => {
    const st = await backend.ls.stat(tmpCwd);
    expect(st.isDirectory()).toBe(true);
    const entries = await backend.ls.readdir(tmpCwd);
    expect(entries).toContain('roundtrip.txt');
  });

  it('reconnects transparently after the connection drops', async () => {
    // Force-close the transport; the next operation should re-establish it.
    const client = (backend as unknown as { client?: { end?: () => void } }).client;
    client?.end?.();
    await new Promise(r => setTimeout(r, 200)); // let the close handler run
    const { exitCode } = await backend.bash.exec('echo back', tmpCwd, { onData: () => { } });
    expect(exitCode).toBe(0);
  });

  it('remote grep tool searches the remote tree (matches + context + no-match)', async () => {
    await backend.write.writeFile(`${tmpCwd}/grepme.txt`, 'alpha one\nbeta two\ngamma three\ndelta four\n');

    const grepTool = createRemoteGrepToolDefinition(backend, tmpCwd);
    expect(grepTool.name).toBe('grep');

    // Basic match.
    const hit = await grepTool.execute('tc1', { pattern: 'beta' }, undefined, undefined, undefined);
    const hitText = (hit.content as Array<{ type: string; text: string }>)[0].text;
    expect(hitText).toContain('grepme.txt:2: beta two');

    // Context lines.
    const ctx = await grepTool.execute('tc2', { pattern: 'gamma', context: 1 }, undefined, undefined, undefined);
    const ctxText = (ctx.content as Array<{ type: string; text: string }>)[0].text;
    expect(ctxText).toContain('grepme.txt:3: gamma three');
    expect(ctxText).toContain('grepme.txt-2- beta two');
    expect(ctxText).toContain('grepme.txt-4- delta four');

    // No matches.
    const miss = await grepTool.execute('tc3', { pattern: 'zzz-not-there' }, undefined, undefined, undefined);
    const missText = (miss.content as Array<{ type: string; text: string }>)[0].text;
    expect(missText).toBe('No matches found');

    // Bad path.
    const bad = await grepTool.execute('tc4', { pattern: 'x', path: 'does-not-exist' }, undefined, undefined, undefined);
    const badText = (bad.content as Array<{ type: string; text: string }>)[0].text;
    expect(badText).toContain('Path not found');

    // Limit notice.
    const lim = await grepTool.execute('tc5', { pattern: 'e', limit: 2 }, undefined, undefined, undefined);
    const limText = (lim.content as Array<{ type: string; text: string }>)[0].text;
    expect(limText).toContain('2 matches limit reached');
  });

  it('parses a full spec string into a working backend', async () => {
    const spec = parseTerminalSpec(`ssh -i ${KEY} ${USER}@${HOST}:${tmpCwd}`);
    expect(spec.kind).toBe('ssh');
    const b = new SshBackend(spec as Extract<typeof spec, { kind: 'ssh' }>);
    await b.connect();
    expect(await b.resolveCwd()).toBe(tmpCwd);
    await b.dispose();
  });
});
