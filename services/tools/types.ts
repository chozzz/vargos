import { z } from 'zod';
import type { Bus } from '../../gateway/bus.js';

export interface TextContent  { type: 'text'; text: string }
export interface ImageContent { type: 'image'; data: string; mimeType: string }
export type ToolContent = TextContent | ImageContent;

export interface ToolResult {
  content:  ToolContent[];
  isError?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  sessionKey:   string;
  workingDir:   string;
  env?:         Record<string, string>;
  abortSignal?: AbortSignal;
  bus:          Bus;
}

export interface Tool {
  name:        string;
  description: string;
  parameters:  z.ZodSchema;
  jsonSchema?:  unknown;
  execute:     (args: unknown, context: ToolContext) => Promise<ToolResult>;
  formatCall?:  (args: Record<string, unknown>) => string;
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
export function getFirstTextContent(content: ToolContent[]): string {
  const c = content[0];
  return c?.type === 'text' ? c.text : '';
}
