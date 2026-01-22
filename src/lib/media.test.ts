import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveMedia } from './media.js';

const TEST_DIR = path.join(os.tmpdir(), 'vargos-media-test');

// Override VARGOS_DATA_DIR so files go to tmp
const origEnv = process.env.VARGOS_DATA_DIR;

describe('saveMedia', () => {
  beforeEach(() => { process.env.VARGOS_DATA_DIR = TEST_DIR; });
  afterEach(async () => {
    process.env.VARGOS_DATA_DIR = origEnv;
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('writes buffer to disk and returns absolute path', async () => {
    const buf = Buffer.from('fake-jpeg-data');
    const result = await saveMedia({ buffer: buf, sessionKey: 'wa:123', mimeType: 'image/jpeg' });

    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toMatch(/\.jpg$/);
    expect(result).toContain('wa-123');

    const contents = await readFile(result);
    expect(contents.equals(buf)).toBe(true);
  });

  it('derives correct extension from mime type', async () => {
    const cases: Array<[string, string]> = [
      ['image/png', '.png'],
      ['image/webp', '.webp'],
      ['audio/mpeg', '.mp3'],
      ['application/pdf', '.pdf'],
      ['application/unknown', '.bin'],
    ];

    for (const [mime, ext] of cases) {
      const result = await saveMedia({
        buffer: Buffer.from('data'),
        sessionKey: 'test',
        mimeType: mime,
      });
      expect(result).toMatch(new RegExp(`\\${ext}$`));
    }
  });

  it('produces sortable, collision-resistant filenames', async () => {
    const a = await saveMedia({ buffer: Buffer.from('aaa'), sessionKey: 's', mimeType: 'image/jpeg' });
    const b = await saveMedia({ buffer: Buffer.from('bbb'), sessionKey: 's', mimeType: 'image/jpeg' });

    const nameA = path.basename(a);
    const nameB = path.basename(b);

    // Both match pattern: YYYY-MM-DD_HHmmss_xxxx.ext
    const pattern = /^\d{4}-\d{2}-\d{2}_\d{6}_[a-f0-9]{4}\.jpg$/;
    expect(nameA).toMatch(pattern);
    expect(nameB).toMatch(pattern);

    // Different content → different hash suffix
    expect(nameA).not.toBe(nameB);
  });
});
