/**
 * Core tool abstractions for Vargos
 * Clean, reusable base classes for all tools
 */

import { z } from 'zod';

// Tool result types
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

// Tool context passed to all tool executions
export interface ToolContext {
  sessionKey: string;
  workingDir: string;
  env?: Record<string, string>;
  abortSignal?: AbortSignal;
}

// Core tool interface
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

// Helper functions for creating results
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

// Base error class for tool errors
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

