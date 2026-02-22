/**
 * Sessions delete tool - Remove a session via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const SessionsDeleteParameters = z.object({
  sessionKey: z.string().describe('Session key to delete (use sessions_list to find keys)'),
});

export const sessionsDeleteTool: Tool = {
  name: 'sessions_delete',
  description: 'Delete a session and its message history. Use sessions_list to find session keys.',
  parameters: SessionsDeleteParameters,
  formatCall: (args) => String(args.sessionKey || ''),
  execute: async (args: unknown, context: ToolContext) => {
    const { sessionKey } = SessionsDeleteParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      await context.call('sessions', 'session.delete', { sessionKey });
      return textResult(`Deleted session: ${sessionKey}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to delete session: ${message}`);
    }
  },
};
