import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalBackend } from '../terminal/local.js';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let dir: string;
let backend: LocalBackend;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'vargos-terminal-'));
  backend = new LocalBackend({ kind: 'local', cwd: dir });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalBackend', () => {
  it('resolves cwd to the configured path', async () => {
    expect(await backend.resolveCwd()).toBe(dir);
  });

  it('read ops read files and check readability', async () => {
    const p = path.join(dir, 'read.txt');
    await writeFile(p, 'hello', 'utf8');
    expect(await backend.read.readFile(p)).toEqual(Buffer.from('hello'));
    await expect(backend.read.access(p)).resolves.toBeUndefined();
    await expect(backend.read.access(path.join(dir, 'nope.txt'))).rejects.toThrow();
  });

  it('read ops detect image MIME types from magic bytes', async () => {
    const png = path.join(dir, 'img.png');
    const txt = path.join(dir, 'plain.txt');
    await writeFile(png, PNG_HEADER);
    await writeFile(txt, 'not an image', 'utf8');
    expect(await backend.read.detectImageMimeType?.(png)).toBe('image/png');
    expect(await backend.read.detectImageMimeType?.(txt)).toBeNull();
  });

  it('write ops create parents on mkdir and write files', async () => {
    const sub = path.join(dir, 'a', 'b');
    await backend.write.mkdir(sub);
    const p = path.join(sub, 'f.txt');
    await backend.write.writeFile(p, 'content', 'utf8');
    expect(await readFile(p, 'utf8')).toBe('content');
  });

  it('edit ops combine read + write + access', async () => {
    const p = path.join(dir, 'edit.txt');
    await backend.write.writeFile(p, 'original', 'utf8');
    expect((await backend.edit.readFile(p)).toString()).toBe('original');
    await expect(backend.edit.access(p)).resolves.toBeUndefined();
    await backend.edit.writeFile(p, 'updated', 'utf8');
    expect(await readFile(p, 'utf8')).toBe('updated');
  });

  it('find ops check existence and glob patterns', async () => {
    expect(await backend.find.exists(dir)).toBe(true);
    expect(await backend.find.exists(path.join(dir, 'missing'))).toBe(false);

    const sub = path.join(dir, 'findme');
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(sub, 'one.ts'), '', 'utf8');
    await writeFile(path.join(sub, 'two.ts'), '', 'utf8');
    await writeFile(path.join(sub, 'skip.log'), '', 'utf8');

    const found = await backend.find.glob('**/*.ts', sub, { ignore: ['*.log'], limit: 10 });
    expect(found.map(f => path.basename(f)).sort()).toEqual(['one.ts', 'two.ts']);

    const limited = await backend.find.glob('**/*.ts', sub, { ignore: [], limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it('ls ops stat and list directories', async () => {
    expect(await backend.ls.exists(dir)).toBe(true);
    const st = await backend.ls.stat(dir);
    expect(st.isDirectory()).toBe(true);
    const entries = await backend.ls.readdir(dir);
    expect(entries).toContain('read.txt');
  });

  it('connect/dispose are no-ops', async () => {
    await expect(backend.connect()).resolves.toBeUndefined();
    await expect(backend.dispose()).resolves.toBeUndefined();
  });
});
