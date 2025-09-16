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

// Tool factory type for creating configured tools
export type ToolFactory<TConfig = unknown> = (config?: TConfig) => Tool;

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

// Security error
export class SecurityError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_VIOLATION', details);
  }
}

// Validation error
export class ValidationError extends ToolError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
  }
}
