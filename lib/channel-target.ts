import { parseChannelTarget } from './subagent.js';

/** Parse "whatsapp:614..." → { channel, userId } or null */
export function parseTarget(target: string): { channel: string; userId: string } | null {
  return parseChannelTarget(target);
}
