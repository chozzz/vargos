/**
 * Sessions list tool - List active sessions via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const SessionsListParameters = z.object({
  kinds: z.array(z.enum(['main', 'subagent'])).optional().describe('Filter by session kinds'),
  limit: z.number().optional().describe('Maximum number of sessions to return'),
  messageLimit: z.number().optional().describe('Include last N messages per session'),
});

export const sessionsListTool: Tool = {
  name: 'sessions_list',
  description: 'List sessions with optional filters and last messages',
  parameters: SessionsListParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsListParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      const list = await context.call<any[]>('sessions', 'session.list', {
        limit: params.limit,
        kind: params.kinds?.[0],
      });

      if (list.length === 0) return textResult('No sessions found.');

      const messageLimit = Math.min(params.messageLimit ?? 0, 10);

      const formatted = await Promise.all(list.map(async s => {
        let text = `Session: ${s.sessionKey}`;
        if (s.label) text += ` (${s.label})`;
        if (s.agentId) text += ` [agent: ${s.agentId}]`;
        text += `\n  Kind: ${s.kind}`;
        text += `\n  Updated: ${s.updatedAt}`;

        if (messageLimit > 0) {
          const messages = await context.call!<any[]>('sessions', 'session.getMessages', {
            sessionKey: s.sessionKey, limit: messageLimit,
          });
          if (messages.length > 0) {
            text += '\n  Recent messages:';
            for (const msg of messages.slice(-messageLimit)) {
              const preview = msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '');
              text += `\n    [${msg.role}] ${preview}`;
            }
          }
        }

        return text;
      }));

      return textResult(`Found ${list.length} sessions:\n\n${formatted.join('\n\n')}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions list failed: ${message}`);
    }
  },
};
