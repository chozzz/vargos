/**
 * WhatsApp message normalizer — converts WhatsApp adapter output to canonical form.
 */
import type { NormalizedInboundMessage } from '../../types.js';
import type { WhatsAppInboundMessage } from './types.js';
export interface WhatsAppNormalizerContext {
    botJid: string;
    botLid?: string | null;
    botName?: string;
}
export declare function normalizeWhatsAppMessage(msg: WhatsAppInboundMessage, context: WhatsAppNormalizerContext): NormalizedInboundMessage | null;
//# sourceMappingURL=normalizer.d.ts.map