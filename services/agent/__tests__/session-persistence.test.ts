import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionManager } from '@mariozechner/pi-coding-agent';

// ── SessionManager.continueRecent — session file discovery ────────────────────

function createSessionFile(dir: string, name: string, content: string): void {
  writeFileSync(path.join(dir, name), content);
}

function createSessionHeader(id: string, timestamp: string): string {
  return JSON.stringify({
    type: 'session',
    version: 3,
    id,
    timestamp,
    cwd: '/tmp/test',
  });
}

describe('SessionManager.continueRecent', () => {
  let tmpDir: string;
  let sessionDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `session-persist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionDir = path.join(tmpDir, 'sessions');
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to create() when no session files exist', () => {
    const result = SessionManager.continueRecent('/tmp/test', sessionDir);
    expect(result).toBeDefined();
    // continueRecent creates a new file when none exist — that's the fallback behavior
    expect(result.getSessionFile()).toBeDefined();
    expect(result.getSessionFile()!.endsWith('.jsonl')).toBe(true);
  });

  it('loads the most recent session file by mtime', () => {
    const oldFile = '2026-01-01T00-00-00-000Z_test.jsonl';
    const newFile = '2026-05-25T12-00-00-000Z_test.jsonl';

    createSessionFile(sessionDir, oldFile, createSessionHeader('old-id', '2026-01-01T00:00:00.000Z'));
    createSessionFile(sessionDir, newFile, createSessionHeader('new-id', '2026-05-25T12:00:00.000Z'));

    // Ensure newFile has a later mtime by touching it
    const laterDate = new Date();
    laterDate.setMinutes(laterDate.getMinutes() + 1);
    utimesSync(path.join(sessionDir, newFile), laterDate, laterDate);

    const result = SessionManager.continueRecent('/tmp/test', sessionDir);
    expect(result.getSessionFile()).toContain(newFile);
  });

  it('ignores non-jsonl files and creates new', () => {
    writeFileSync(path.join(sessionDir, 'invalid.txt'), 'not a session');

    const result = SessionManager.continueRecent('/tmp/test', sessionDir);
    // Falls back to create() which generates a new file
    expect(result.getSessionFile()).toBeDefined();
    expect(result.getSessionFile()!.endsWith('.jsonl')).toBe(true);
  });

  it('loads session messages when file exists', () => {
    const fileName = '2026-05-25T12-00-00-000Z_test.jsonl';
    const content = [
      createSessionHeader('test-id', '2026-05-25T12:00:00.000Z'),
      JSON.stringify({
        type: 'message',
        id: 'msg-1',
        parentId: null,
        timestamp: '2026-05-25T12:00:01.000Z',
        message: { role: 'user', content: 'hello' },
      }),
      JSON.stringify({
        type: 'message',
        id: 'msg-2',
        parentId: 'msg-1',
        timestamp: '2026-05-25T12:00:02.000Z',
        message: { role: 'assistant', content: 'hi there' },
      }),
    ].join('\n');

    createSessionFile(sessionDir, fileName, content);

    const result = SessionManager.continueRecent('/tmp/test', sessionDir);
    const ctx = result.buildSessionContext();
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[0].role).toBe('user');
    expect(ctx.messages[0].content).toBe('hello');
    expect(ctx.messages[1].role).toBe('assistant');
    expect(ctx.messages[1].content).toBe('hi there');
  });

  it('handles empty session file (header only)', () => {
    const fileName = '2026-05-25T12-00-00-000Z_empty.jsonl';
    const content = createSessionHeader('empty-id', '2026-05-25T12:00:00.000Z');

    createSessionFile(sessionDir, fileName, content);

    const result = SessionManager.continueRecent('/tmp/test', sessionDir);
    const ctx = result.buildSessionContext();
    expect(ctx.messages).toHaveLength(0);
  });
});
