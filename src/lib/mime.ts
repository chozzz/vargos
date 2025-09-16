/**
 * MIME type detection - Ported from OpenClaw
 */

/**
 * Detect MIME type from file buffer
 * Simple implementation based on magic numbers
 */
export async function detectMimeType(buffer: Buffer): Promise<string> {
  // Check magic numbers
  if (buffer.length < 4) {
    return 'application/octet-stream';
  }

  const hex = buffer.toString('hex', 0, 4);

  // PNG
  if (hex.startsWith('89504e47')) {
    return 'image/png';
  }

  // JPEG
  if (hex.startsWith('ffd8ff')) {
    return 'image/jpeg';
  }

  // GIF
  if (hex.startsWith('47494638')) {
    return 'image/gif';
  }

  // WebP
  if (hex.startsWith('52494646') && buffer.length >= 12) {
    const webpHex = buffer.toString('hex', 8, 12);
    if (webpHex.startsWith('57454250')) {
      return 'image/webp';
    }
  }

  // BMP
  if (hex.startsWith('424d')) {
    return 'image/bmp';
  }

  // SVG (check content)
  const contentStart = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
  if (contentStart.includes('<?xml') && contentStart.includes('<svg')) {
    return 'image/svg+xml';
  }
  if (contentStart.includes('<svg')) {
    return 'image/svg+xml';
  }

  // Text files
  const textContent = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
  if (textContent.includes('<?xml')) {
    return 'application/xml';
  }
  if (textContent.includes('<!DOCTYPE html') || textContent.includes('<html')) {
    return 'text/html';
  }
  if (textContent.includes('{') || textContent.includes('[')) {
    // Might be JSON
    try {
      JSON.parse(textContent.slice(0, textContent.indexOf('\n')) || textContent);
      return 'application/json';
    } catch {
      // Not valid JSON
    }
  }

  // Check if mostly printable (text)
  const printable = buffer.slice(0, Math.min(100, buffer.length)).toString('utf-8');
  const nonPrintable = [...printable].filter(c => {
    const code = c.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  }).length;
  
  if (nonPrintable === 0) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}
