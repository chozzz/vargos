/**
 * File read tool
 * Reads file contents with support for text and images
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Tool, ToolContext, ToolResult, textResult, errorResult, imageResult } from '../types.js';
import { detectMimeType } from '../../lib/mime.js';
import { expandTilde } from '../../lib/path.js';

const ReadParameters = z.object({
  path: z.string().describe('Path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read'),
});

export const readTool: Tool = {
  name: 'read',
  description: 'Read the contents of a file. Use offset/limit for large files. Supports text and images.',
  parameters: ReadParameters,
  formatCall: (args) => String(args.path || ''),
  formatResult: (result) => {
    const text = result.content[0];
    if (text?.type === 'image') return 'image';
    const lines = text?.type === 'text' ? text.text.split('\n').length : 0;
    return `${lines} lines`;
  },
  execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
    const params = ReadParameters.parse(args);
    const resolvedPath = expandTilde(params.path);
    const filePath = path.resolve(context.workingDir, resolvedPath);

    try {
      const stat = await fs.stat(filePath);
      
      if (!stat.isFile()) {
        return errorResult(`Not a file: ${params.path}`);
      }

      // Check file size (limit to 5MB for safety)
      if (stat.size > 5 * 1024 * 1024) {
        return errorResult(`File too large (${Math.round(stat.size / 1024 / 1024)}MB). Use offset/limit.`);
      }

      const buffer = await fs.readFile(filePath);
      const mimeType = await detectMimeType(buffer);

      // Handle images
      if (mimeType.startsWith('image/')) {
        const base64 = buffer.toString('base64');
        return imageResult(base64, mimeType);
      }

      // Handle text
      let content = buffer.toString('utf-8');

      // Apply offset/limit if specified
      if (params.offset !== undefined || params.limit !== undefined) {
        const lines = content.split('\n');
        const offset = (params.offset ?? 1) - 1; // Convert to 0-indexed
        const limit = params.limit ?? lines.length;
        content = lines.slice(offset, offset + limit).join('\n');
      }

      return textResult(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT')) {
        return errorResult(`File not found: ${params.path}`);
      }
      return errorResult(`Read failed: ${message}`);
    }
  },
};
