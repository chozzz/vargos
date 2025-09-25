/**
 * Tool types for Vargos MCP
 * Ported from OpenClaw patterns
 */

import { z } from 'zod';

export interface ToolContext {
  sessionKey: string;
  workingDir: string;
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

export function textResult(text: string, _metadata?: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(error: string): ToolResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

export function imageResult(data: string, mimeType: string): ToolResult {
  return { content: [{ type: 'image', data, mimeType }] };
}

/** Get first content block's text; use in tests when you expect a single text block. */
export function getFirstTextContent(content: ToolResult['content']): string {
  const c = content[0];
  return c?.type === 'text' ? c.text : '';
}
