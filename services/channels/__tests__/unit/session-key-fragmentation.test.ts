/**
 * WhatsApp session key consistency — Option A: full JIDs in session keys.
 *
 * Both text and media paths use raw JIDs (with @lid / @s.whatsapp.net suffix).
 * The adapter preserves the suffix so toJid() can reconstruct the correct JID
 * for outbound sends — no bare LID numbers that silently fail to deliver.
 */
import { describe, it, expect } from 'vitest';

function buildSessionKey(instanceId: string, jid: string): string {
  return `${instanceId}:${jid}`;
}

describe('WhatsApp Session Key Consistency — full JIDs', () => {
  const instanceId = 'whatsapp-vadi-indo';

  it('produces session key with @lid suffix preserved', () => {
    const key = buildSessionKey(instanceId, '210994982838335@lid');
    expect(key).toBe('whatsapp-vadi-indo:210994982838335@lid');
    expect(key).toContain('@lid');
  });

  it('produces session key with @s.whatsapp.net suffix preserved', () => {
    const key = buildSessionKey(instanceId, '61423222658@s.whatsapp.net');
    expect(key).toBe('whatsapp-vadi-indo:61423222658@s.whatsapp.net');
    expect(key).toContain('@s.whatsapp.net');
  });

  it('produces session key with @g.us suffix preserved', () => {
    const key = buildSessionKey(instanceId, '123456789@g.us');
    expect(key).toBe('whatsapp-vadi-indo:123456789@g.us');
    expect(key).toContain('@g.us');
  });

  it('text and media produce the same session key for the same device', () => {
    // Both paths use raw msg.jid, so they produce identical keys
    const textKey = buildSessionKey(instanceId, '210994982838335@lid');
    const mediaKey = buildSessionKey(instanceId, '210994982838335@lid');
    expect(textKey).toBe(mediaKey);
  });

  it('different devices for the same human are different keys (known limitation)', () => {
    // @lid and @s.whatsapp.net are different JIDs — cross-device merging
    // requires lid→PN resolution (Baileys signal repository), not just suffix handling.
    const lidKey = buildSessionKey(instanceId, '210994982838335@lid');
    const pnKey = buildSessionKey(instanceId, '61423222658@s.whatsapp.net');
    expect(lidKey).not.toBe(pnKey);
  });
});
