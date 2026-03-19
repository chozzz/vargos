/**
 * Factory for simple gateway-passthrough tools
 * Handles: Zod parse → context.call → format result → error handling
 */

import type { ZodSchema } from 'zod';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { textResult, errorResult } from '../types.js';
import { toMessage } from '../../lib/error.js';

export interface GatewayToolConfig<T> {
  name: string;
  description: string;
  parameters: ZodSchema<T>;
  service: string;
  method: string;
  /** Map parsed args to the execute logic; return a ToolResult */
  execute: (args: T, call: NonNullable<ToolContext['call']>) => Promise<ToolResult>;
  formatCall?: (args: Record<string, unknown>) => string;
  formatResult?: (result: ToolResult) => string;
}

export function defineGatewayTool<T>(config: GatewayToolConfig<T>): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    formatCall: config.formatCall,
    formatResult: config.formatResult,
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      if (!context.call) return errorResult('Gateway not available');
      try {
        const parsed = config.parameters.parse(args) as T;
        return await config.execute(parsed, context.call);
      } catch (err) {
        return errorResult(toMessage(err));
      }
    },
  };
}

/** Convenience: gateway call that returns text */
export function gatewayCall<T>(
  call: NonNullable<ToolContext['call']>,
  service: string,
  method: string,
  params?: unknown,
): Promise<T> {
  return call<T>(service, method, params);
}

export { textResult, errorResult };
