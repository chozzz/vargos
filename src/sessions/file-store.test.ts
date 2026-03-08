import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSessionService } from './file-store.js';

describe('FileSessionService.addMessage', () => {
  let tmpDir: string;
  let store: FileSessionService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-file-store-test-'));
    store = new FileSessionService({ baseDir: tmpDir });
    await store.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appends a message without rewriting existing lines', async () => {
    await store.create({ sessionKey: 'test:append', kind: 'main', metadata: {} });

    await store.addMessage({ sessionKey: 'test:append', content: 'first', role: 'user' });

    // Capture raw file state after first message
    const sessionDir = path.join(tmpDir, 'sessions', 'test-append');
    const filePath = path.join(sessionDir, 'test-append.jsonl');
    const after1 = await fs.readFile(filePath, 'utf-8');
    const lines1 = after1.trim().split('\n').filter(Boolean);
    expect(lines1).toHaveLength(2); // metadata + 1 message

    const originalMetaLine = lines1[0];
    const originalMsgLine = lines1[1];

    // Add a second message
    await store.addMessage({ sessionKey: 'test:append', content: 'second', role: 'assistant' });

    const after2 = await fs.readFile(filePath, 'utf-8');
    const lines2 = after2.trim().split('\n').filter(Boolean);
    expect(lines2).toHaveLength(3); // metadata + 2 messages

    // First two lines must be byte-identical — no rewrite occurred
    expect(lines2[0]).toBe(originalMetaLine);
    expect(lines2[1]).toBe(originalMsgLine);
  });

  it('reads all messages back after sequential appends', async () => {
    await store.create({ sessionKey: 'test:order', kind: 'main', metadata: {} });

    for (const content of ['a', 'b', 'c']) {
      await store.addMessage({ sessionKey: 'test:order', content, role: 'user' });
    }

    const messages = await store.getMessages('test:order');
    expect(messages).toHaveLength(3);
    expect(new Set(messages.map(m => m.content))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('concurrent appends do not lose messages', async () => {
    await store.create({ sessionKey: 'test:concurrent', kind: 'main', metadata: {} });

    // Fire 10 concurrent addMessage calls
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        store.addMessage({ sessionKey: 'test:concurrent', content: `msg-${i}`, role: 'user' }),
      ),
    );

    const messages = await store.getMessages('test:concurrent');
    expect(messages).toHaveLength(N);

    const contents = new Set(messages.map(m => m.content));
    for (let i = 0; i < N; i++) {
      expect(contents.has(`msg-${i}`)).toBe(true);
    }
  });

  it('throws when session does not exist', async () => {
    await expect(
      store.addMessage({ sessionKey: 'nonexistent', content: 'hello', role: 'user' }),
    ).rejects.toThrow('Session not found: nonexistent');
  });
});
