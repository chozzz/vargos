/**
 * Telegram message normalizer — converts Telegram adapter output to canonical form.
 */
import type { NormalizedInboundMessage } from '../../types.js';
import type { TelegramMessage } from './types.js';
export interface TelegramNormalizerContext {
    botUserId: number | null;
    botUsername?: string;
    botName?: string;
}
export declare function normalizeTelegramMessage(msg: TelegramMessage, context: TelegramNormalizerContext): NormalizedInboundMessage | null;
//# sourceMappingURL=normalizer.d.ts.map