/**
 * File write tool - Ported from OpenClaw
 * Creates or overwrites files
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from './types.js';

const WriteParameters = z.object({
  path: z.string().describe('Path to the file to write'),
  content: z.string().describe('Content to write to the file'),
});

export const writeTool: Tool = {
  name: 'write',
  description: 'Create a new file or overwrite an existing file with new content.',
  parameters: WriteParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = WriteParameters.parse(args);
    const filePath = path.resolve(context.workingDir, params.path);
    
    // Security: Ensure path is within working directory
    if (!filePath.startsWith(context.workingDir)) {
      return errorResult(`Access denied: ${params.path} is outside the workspace`);
    }

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(filePath);
      await fs.mkdir(parentDir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, params.content, 'utf-8');

      return textResult(`Successfully wrote ${params.content.length} characters to ${params.path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Write failed: ${message}`);
    }
  },
};
