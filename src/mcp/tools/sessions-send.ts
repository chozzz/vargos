/**
 * Sessions send tool - Updated to use service abstraction
 * Send message to a session
 * Works with file-based or postgres backends
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getSessionService } from '../../services/factory.js';

const SessionsSendParameters = z.object({
  sessionKey: z.string().describe('Target session key'),
  message: z.string().describe('Message to send'),
});

export const sessionsSendTool: Tool = {
  name: 'sessions_send',
  description: 'Send a message into another session',
  parameters: SessionsSendParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsSendParameters.parse(args);
    
    try {
      const sessions = getSessionService();
      
      // Ensure session exists
      let session = await sessions.get(params.sessionKey);
      if (!session) {
        // Auto-create if doesn't exist
        session = await sessions.create({
          sessionKey: params.sessionKey,
          kind: 'subagent',
          metadata: {},
        });
      }

      await sessions.addMessage({
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
