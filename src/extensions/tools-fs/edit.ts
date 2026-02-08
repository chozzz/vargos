/**
 * File edit tool
 * Surgical text replacement (find and replace)
 */

import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from '../../core/tools/types.js';
import { expandTilde } from '../../core/lib/path.js';

const EditParameters = z.object({
  path: z.string().describe('Path to the file to edit'),
  oldText: z.string().describe('Exact text to replace (must match exactly including whitespace)'),
  newText: z.string().describe('Replacement text'),
});

export const editTool: Tool = {
  name: 'edit',
  description: 'Make surgical edits to a file by replacing exact text. The oldText must match exactly including whitespace.',
  parameters: EditParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = EditParameters.parse(args);
    const resolvedPath = expandTilde(params.path);
    const filePath = path.resolve(context.workingDir, resolvedPath);

    try {
      // Read existing content
      const content = await fs.readFile(filePath, 'utf-8');

      // Find the exact text
      const occurrences = content.split(params.oldText).length - 1;
      
      if (occurrences === 0) {
        return errorResult(`Could not find the text to replace in ${params.path}. The oldText must match exactly.`);
      }
      
      if (occurrences > 1) {
        return errorResult(`Found ${occurrences} occurrences of the text. Please be more specific with oldText to match exactly one location.`);
      }

      // Perform replacement
      const newContent = content.replace(params.oldText, params.newText);
      
      // Write back
      await fs.writeFile(filePath, newContent, 'utf-8');

      return textResult(`Successfully edited ${params.path}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ENOENT')) {
        return errorResult(`File not found: ${params.path}`);
      }
      return errorResult(`Edit failed: ${message}`);
    }
  },
};
