import { describe, it, expect } from 'vitest';
import { detectMimeType } from './mime.js';

describe('detectMimeType', () => {
  it('should detect PNG', async () => {
    const buf = Buffer.from('89504e470d0a1a0a', 'hex');
    expect(await detectMimeType(buf)).toBe('image/png');
  });

  it('should detect JPEG', async () => {
    const buf = Buffer.from('ffd8ffe000104a464946', 'hex');
    expect(await detectMimeType(buf)).toBe('image/jpeg');
  });

  it('should detect GIF', async () => {
    const buf = Buffer.from('47494638396100', 'hex');
    expect(await detectMimeType(buf)).toBe('image/gif');
  });

  it('should detect BMP', async () => {
    const buf = Buffer.from('424d00000000', 'hex');
    expect(await detectMimeType(buf)).toBe('image/bmp');
  });

  it('should detect WebP', async () => {
    // RIFF....WEBP
    const buf = Buffer.alloc(12);
    Buffer.from('52494646', 'hex').copy(buf, 0); // RIFF
    buf.writeUInt32LE(0, 4); // file size placeholder
    Buffer.from('57454250', 'hex').copy(buf, 8); // WEBP
    expect(await detectMimeType(buf)).toBe('image/webp');
  });

  it('should return octet-stream for buffers < 4 bytes', async () => {
    expect(await detectMimeType(Buffer.from([0x00, 0x01]))).toBe('application/octet-stream');
  });

  it('should detect SVG', async () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(await detectMimeType(buf)).toBe('image/svg+xml');
  });

  it('should detect HTML', async () => {
    const buf = Buffer.from('<!DOCTYPE html><html><body></body></html>');
    expect(await detectMimeType(buf)).toBe('text/html');
  });

  it('should detect JSON', async () => {
    const buf = Buffer.from('{"key":"value"}\n');
    expect(await detectMimeType(buf)).toBe('application/json');
  });

  it('should detect plain text', async () => {
    const buf = Buffer.from('Hello, this is plain text content.');
    expect(await detectMimeType(buf)).toBe('text/plain');
  });

  it('should return octet-stream for binary data', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(await detectMimeType(buf)).toBe('application/octet-stream');
  });
});
