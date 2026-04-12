/** Parse "whatsapp:614..." → { channel, userId } or null */
export function parseTarget(target: string): { channel: string; userId: string } | null {
  const idx = target.indexOf(':');
  if (idx < 1) return null;
  return { channel: target.slice(0, idx), userId: target.slice(idx + 1) };
}
