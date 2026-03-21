import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractMediaPaths } from './media-extract.js';

// Mock fs.accessSync — all paths "exist" unless overridden
vi.mock('node:fs', () => ({
  accessSync: vi.fn(),
}));

describe('extractMediaPaths', () => {
  it('extracts absolute paths from plain text', () => {
    const result = extractMediaPaths('Check this image /home/user/photo.png for review');
    expect(result).toEqual([{ filePath: '/home/user/photo.png', mimeType: 'image/png' }]);
  });

  it('extracts paths from markdown image syntax ![](./path)', () => {
    const text = '![Bakabit Image](./home/choz/nanobanana-images/temp_images/abc123.png)';
    const result = extractMediaPaths(text);
    expect(result).toEqual([{
      filePath: '/home/choz/nanobanana-images/temp_images/abc123.png',
      mimeType: 'image/png',
    }]);
  });

  it('extracts paths from markdown image syntax ![](path)', () => {
    const text = '![alt](/home/choz/output.jpg)';
    const result = extractMediaPaths(text);
    expect(result).toEqual([{ filePath: '/home/choz/output.jpg', mimeType: 'image/jpeg' }]);
  });

  it('extracts paths in [brackets]', () => {
    const text = 'Saved to [/mnt/ai/outputs/comfyui/image.webp]';
    const result = extractMediaPaths(text);
    expect(result).toEqual([{ filePath: '/mnt/ai/outputs/comfyui/image.webp', mimeType: 'image/webp' }]);
  });

  it('extracts multiple unique paths', () => {
    const text = 'Image: /tmp/a.png and video: /tmp/b.mp4';
    const result = extractMediaPaths(text);
    expect(result.length).toBe(2);
    expect(result[0].filePath).toBe('/tmp/a.png');
    expect(result[1].filePath).toBe('/tmp/b.mp4');
  });

  it('deduplicates repeated paths', () => {
    const text = '/tmp/a.png and again /tmp/a.png';
    const result = extractMediaPaths(text);
    expect(result.length).toBe(1);
  });

  it('ignores non-media extensions', () => {
    const result = extractMediaPaths('File at /home/user/data.csv');
    expect(result).toEqual([]);
  });

  it('skips paths that do not exist on disk', async () => {
    const { accessSync } = await import('node:fs');
    (accessSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = extractMediaPaths('Image at /tmp/missing.png');
    expect(result).toEqual([]);

    // Restore
    (accessSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });
});
