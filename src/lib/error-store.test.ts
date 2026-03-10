import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

// Mock resolveDataDir to use a temp dir
vi.mock('../config/paths.js', () => ({
  resolveDataDir: () => tmpDir,
}));

const { appendError, readErrors } = await import('./error-store.js');

describe('appendError', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-errors-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appends a valid JSONL entry', async () => {
    await appendError({ message: 'ECONNRESET: connection reset', sessionKey: 'whatsapp:123' });

    const content = await fs.readFile(path.join(tmpDir, 'errors.jsonl'), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.message).toBe('ECONNRESET: connection reset');
    expect(entry.sessionKey).toBe('whatsapp:123');
    expect(entry.errorClass).toBe('transient');
  });

  it('auto-classifies error class from message', async () => {
    await appendError({ message: 'HTTP 401 Unauthorized' });
    const content = await fs.readFile(path.join(tmpDir, 'errors.jsonl'), 'utf-8');
    expect(JSON.parse(content.trim()).errorClass).toBe('auth');
  });

  it('uses explicit errorClass when provided', async () => {
    await appendError({ message: 'something broke', errorClass: 'fatal' });
    const content = await fs.readFile(path.join(tmpDir, 'errors.jsonl'), 'utf-8');
    expect(JSON.parse(content.trim()).errorClass).toBe('fatal');
  });

  it('sanitizes API keys from persisted messages', async () => {
    await appendError({ message: 'Error with key sk-abc123456789xyz' });
    const content = await fs.readFile(path.join(tmpDir, 'errors.jsonl'), 'utf-8');
    expect(content).not.toContain('abc123456789xyz');
    expect(content).toContain('sk-***');
  });

  it('appends multiple entries as separate lines', async () => {
    await appendError({ message: 'first error' });
    await appendError({ message: 'second error' });
    const content = await fs.readFile(path.join(tmpDir, 'errors.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('readErrors', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-errors-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when file does not exist', async () => {
    const errors = await readErrors();
    expect(errors).toEqual([]);
  });

  it('returns all errors when no filter specified', async () => {
    await appendError({ message: 'error one' });
    await appendError({ message: 'error two' });
    const errors = await readErrors();
    expect(errors).toHaveLength(2);
  });

  it('filters by sinceHours', async () => {
    // Write an old entry directly
    const oldTs = new Date(Date.now() - 48 * 3600_000).toISOString();
    const oldEntry = JSON.stringify({ ts: oldTs, errorClass: 'unknown', message: 'old error' });
    await fs.writeFile(path.join(tmpDir, 'errors.jsonl'), oldEntry + '\n');

    // Write a recent entry via appendError
    await appendError({ message: 'recent error' });

    const errors = await readErrors({ sinceHours: 24 });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('recent error');
  });
});
