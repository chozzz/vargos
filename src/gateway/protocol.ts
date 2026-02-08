/**
 * Gateway wire protocol
 * Three frame types over WebSocket: request, response, event
 */

import { z } from 'zod';
import crypto from 'node:crypto';

// ============================================================================
// Frame Types
// ============================================================================

export interface RequestFrame {
  type: 'req';
  id: string;
  target: string;
  method: string;
  params?: unknown;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

export interface EventFrame {
  type: 'event';
  source: string;
  event: string;
  payload?: unknown;
  seq?: number;
}

export type Frame = RequestFrame | ResponseFrame | EventFrame;

// ============================================================================
// Service Registration
// ============================================================================

export interface ServiceRegistration {
  service: string;
  version: string;
  methods: string[];
  events: string[];
  subscriptions: string[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const RequestFrameSchema = z.object({
  type: z.literal('req'),
  id: z.string(),
  target: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const ResponseFrameSchema = z.object({
  type: z.literal('res'),
  id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
});

export const EventFrameSchema = z.object({
  type: z.literal('event'),
  source: z.string(),
  event: z.string(),
  payload: z.unknown().optional(),
  seq: z.number().optional(),
});

export const FrameSchema = z.discriminatedUnion('type', [
  RequestFrameSchema,
  ResponseFrameSchema,
  EventFrameSchema,
]);

export const ServiceRegistrationSchema = z.object({
  service: z.string(),
  version: z.string(),
  methods: z.array(z.string()),
  events: z.array(z.string()),
  subscriptions: z.array(z.string()),
});

// ============================================================================
// Helpers
// ============================================================================

export function parseFrame(data: string): Frame {
  const json = JSON.parse(data);
  return FrameSchema.parse(json);
}

export function serializeFrame(frame: Frame): string {
  return JSON.stringify(frame);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}
