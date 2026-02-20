/**
 * Core tool abstractions for Vargos
 */

import { z } from 'zod';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type ToolContent = TextContent | ImageContent;

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  sessionKey: string;
  workingDir: string;
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
  /** Gateway RPC — call other services through the gateway */
  call?: <T = unknown>(target: string, method: string, params?: unknown) => Promise<T>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
  /** Compact one-line summary for logging, e.g. "read(/path/to/file)" */
  formatCall?: (args: Record<string, unknown>) => string;
  /** Compact result summary for logging, e.g. "read 47 lines" */
  formatResult?: (result: ToolResult) => string;
}

export function textResult(text: string, metadata?: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }], metadata };
}

export function errorResult(error: string): ToolResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

export function imageResult(data: string, mimeType: string): ToolResult {
  return { content: [{ type: 'image', data, mimeType }] };
}

/** Get first content block's text; use in tests when you expect a single text block. */
export function getFirstTextContent(content: ToolContent[]): string {
  const c = content[0];
  return c?.type === 'text' ? c.text : '';
}
