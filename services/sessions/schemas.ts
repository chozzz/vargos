import { z } from 'zod';

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  id:         z.string(),
  sessionKey: z.string(),
  role:       MessageRoleSchema,
  content:    z.string(),
  timestamp:  z.coerce.date(),
  metadata:   z.record(z.unknown()).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const SessionSchema = z.object({
  sessionKey: z.string(),
  label:      z.string().optional(),
  kind:       z.enum(['main', 'subagent', 'cron']),
  createdAt:  z.coerce.date(),
  updatedAt:  z.coerce.date(),
  metadata:   z.record(z.unknown()).default({}),
  notify:     z.array(z.string()).optional(),
});
export type Session = z.infer<typeof SessionSchema>;
