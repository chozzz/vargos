/**
 * Base tool class with common functionality
 * Provides validation, error handling, and logging hooks
 */

import { z } from 'zod';
import { Tool, ToolContext, ToolResult, errorResult } from './types.js';
import { toMessage } from '../../lib/error.js';

export interface BaseToolConfig {
  name: string;
  description: string;
  parameters: z.ZodSchema;
}

export abstract class BaseTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodSchema;

  constructor(config: BaseToolConfig) {
    this.name = config.name;
    this.description = config.description;
    this.parameters = config.parameters;
  }

  abstract executeImpl(args: unknown, context: ToolContext): Promise<ToolResult>;

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const validated = this.parameters.parse(args);
      return await this.executeImpl(validated, context);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return errorResult(`Parameter validation failed: ${issues}`);
      }

      const message = toMessage(err);
      return errorResult(`${this.name} failed: ${message}`);
    }
  }
}
