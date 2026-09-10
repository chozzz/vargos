/**
 * Image MIME detection from magic bytes — shared by terminal backends so the
 * Pi SDK read tool can attach remote files as images (vision models) the same
 * way it does locally.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_MAGIC = Buffer.from([0x47, 0x49, 0x46, 0x38]); // "GIF8"
const RIFF_MAGIC = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');

/** Match image magic bytes; null for non-images. */
export function detectImageMimeType(head: Buffer): string | null {
  if (head.length >= 3 && head.subarray(0, 3).equals(JPEG_MAGIC)) return 'image/jpeg';
  if (head.length >= 4 && head.subarray(0, 4).equals(PNG_MAGIC)) return 'image/png';
  if (head.length >= 4 && head.subarray(0, 4).equals(GIF_MAGIC)) return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).equals(RIFF_MAGIC) && head.subarray(8, 12).equals(WEBP_MAGIC)) {
    return 'image/webp';
  }
  return null;
}
