/**
 * WhatsApp socket creation via Baileys
 * Handles QR code auth and multi-file auth state persistence
 */
import { type WASocket, type WAMessage } from '@whiskeysockets/baileys';
import type { WhatsAppSessionEvents } from './types.js';
export declare function createWhatsAppSocket(authDir: string, events: WhatsAppSessionEvents): Promise<WASocket>;
export declare function processInboundMessage(msg: WAMessage, events: WhatsAppSessionEvents): Promise<void>;
//# sourceMappingURL=session.d.ts.map