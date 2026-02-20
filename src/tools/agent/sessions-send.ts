/**
 * Sessions send tool - Send message to a session via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const SessionsSendParameters = z.object({
  sessionKey: z.string().describe('Target session key'),
  message: z.string().describe('Message to send'),
});

export const sessionsSendTool: Tool = {
  name: 'sessions_send',
  description: 'Send a message into another session',
  parameters: SessionsSendParameters,
  formatCall: (args) => String(args.sessionKey || ''),
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsSendParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      // Ensure session exists
      const session = await context.call('sessions', 'session.get', { sessionKey: params.sessionKey });
      if (!session) {
        await context.call('sessions', 'session.create', {
          sessionKey: params.sessionKey,
          kind: 'subagent',
        });
      }

      await context.call('sessions', 'session.addMessage', {
        sessionKey: params.sessionKey,
        content: params.message,
        role: 'user',
      });

      return textResult(`Message sent to session ${params.sessionKey}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions send failed: ${message}`);
    }
  },
};
