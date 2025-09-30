/**
 * Sessions history tool - Get message history for a session
 * Works with file-based or postgres backends
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getSessionService } from '../../services/factory.js';

const SessionsHistoryParameters = z.object({
  sessionKey: z.string().describe('Target session key'),
  limit: z.number().optional().describe('Maximum number of messages to return'),
  includeTools: z.boolean().optional().describe('Include tool calls and results'),
});

export const sessionsHistoryTool: Tool = {
  name: 'sessions_history',
  description: 'Fetch message history for a session',
  parameters: SessionsHistoryParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsHistoryParameters.parse(args);

    try {
      const sessions = getSessionService();

      // Verify session exists
      const session = await sessions.get(params.sessionKey);
      if (!session) {
        return errorResult(`Session not found: ${params.sessionKey}`);
      }

      // Get messages
      const messages = await sessions.getMessages(params.sessionKey, {
        limit: params.limit,
      });

      if (messages.length === 0) {
        return textResult(`Session ${params.sessionKey} has no messages.`);
      }

      // Format messages
      const formatted = messages.map((msg, idx) => {
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'unknown';
        let text = `[${idx + 1}] ${timestamp} - ${msg.role}`;
        
        if (msg.metadata && Object.keys(msg.metadata).length > 0) {
          const meta = Object.entries(msg.metadata)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          text += ` (${meta})`;
        }
        
        text += `:\n${msg.content}`;
        return text;
      });

      return textResult(
        `Session: ${params.sessionKey}\n` +
          `Total messages: ${messages.length}\n` +
          `Session kind: ${session.kind}\n` +
          `${session.label ? `Label: ${session.label}\n` : ''}` +
          `---\n\n${formatted.join('\n\n')}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions history failed: ${message}`);
    }
  },
};
