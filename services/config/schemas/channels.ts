/**
 * Channel configuration schemas
 */

import { z } from 'zod';

const ChannelBaseSchema = z.object({
  id:         z.string(),
  enabled:    z.boolean().default(true),
  model:      z.string().optional(),   // overrides agent.model for runs from this channel
  debounceMs: z.number().int().min(0).optional(),
  allowFrom:  z.array(z.string()).optional(),
});

export const TelegramChannelSchema  = ChannelBaseSchema.extend({
  type:       z.literal('telegram'),
  botToken:   z.string(),
});
export const WhatsAppChannelSchema  = ChannelBaseSchema.extend({ type: z.literal('whatsapp') });

export const ChannelEntrySchema = z.discriminatedUnion('type', [
  TelegramChannelSchema,
  WhatsAppChannelSchema,
]);

export type ChannelEntry   = z.infer<typeof ChannelEntrySchema>;
export type TelegramChannel = z.infer<typeof TelegramChannelSchema>;
export type WhatsAppChannel = z.infer<typeof WhatsAppChannelSchema>;
