/**
 * Sessions spawn tool - Updated to use service abstraction
 * Spawn a sub-agent in an isolated session
 * Works with file-based or postgres backends
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getSessionService } from '../../services/factory.js';

const SessionsSpawnParameters = z.object({
  task: z.string().describe('Task description for the sub-agent'),
  agentId: z.string().optional().describe('Optional agent ID to use'),
  label: z.string().optional().describe('Optional label for the session'),
});

export const sessionsSpawnTool: Tool = {
  name: 'sessions_spawn',
  description: 'Spawn a background sub-agent run in an isolated session',
  parameters: SessionsSpawnParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsSpawnParameters.parse(args);
    
    try {
      const sessions = getSessionService();
      
      // Ensure parent session exists
      let parentSession = await sessions.get(context.sessionKey);
      if (!parentSession) {
        parentSession = await sessions.create({
          sessionKey: context.sessionKey,
          kind: 'main',
          metadata: {},
        });
      }

      // Spawn child session
      const childKey = `subagent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const childSession = await sessions.create({
        sessionKey: childKey,
        kind: 'subagent',
        agentId: params.agentId,
        label: params.label ?? `Task: ${params.task.slice(0, 30)}...`,
        metadata: {},
      });

      // Add task as first message
      await sessions.addMessage({
        sessionKey: childKey,
        content: params.task,
        role: 'system',
        metadata: { type: 'task' },
      });

      return textResult(`Spawned sub-agent session: ${childKey}\nTask: ${params.task}\n\nThe sub-agent will process the task and you can check its progress with sessions_list.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions spawn failed: ${message}`);
    }
  },
};
