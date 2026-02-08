/**
 * Base tool class with common functionality
 * Provides validation, error handling, and logging hooks
 */

import { z } from 'zod';
import { Tool, ToolContext, ToolResult, errorResult, ToolError } from './types.js';

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
      // Validate parameters
      const validated = this.parameters.parse(args);
      
      // Pre-execution hook
      await this.beforeExecute(validated, context);
      
      // Execute
      const result = await this.executeImpl(validated, context);
      
      // Post-execution hook
      await this.afterExecute(validated, result, context);
      
      return result;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        return errorResult(`Parameter validation failed: ${issues}`);
      }
      
      if (err instanceof ToolError) {
        return errorResult(`${err.code}: ${err.message}`);
      }
      
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`${this.name} failed: ${message}`);
    }
  }

  // Hooks for subclasses to override
  protected async beforeExecute(_args: unknown, _context: ToolContext): Promise<void> {}
  protected async afterExecute(_args: unknown, _result: ToolResult, _context: ToolContext): Promise<void> {}
}
