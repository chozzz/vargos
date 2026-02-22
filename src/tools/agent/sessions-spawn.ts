/**
 * Sessions spawn tool - Spawn a sub-agent via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';
import { canSpawnSubagent } from '../../lib/errors.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('sessions-spawn');

const SessionsSpawnParameters = z.object({
  task: z.string().describe('Task description for the sub-agent'),
  agentId: z.string().optional().describe('Optional agent ID to use'),
  label: z.string().optional().describe('Optional label for the session'),
  model: z.string().optional().describe('Model to use (e.g., gpt-4o-mini)'),
});

export const sessionsSpawnTool: Tool = {
  name: 'sessions_spawn',
  description: 'Spawn a background sub-agent run in an isolated session and announce result back',
  parameters: SessionsSpawnParameters,
  formatCall: (args) => `task=${String(args.task || '').slice(0, 80)}`,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsSpawnParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      if (!canSpawnSubagent(context.sessionKey)) {
        return errorResult('Maximum sub-agent nesting depth reached.');
      }

      const childKey = `${context.sessionKey}:subagent:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Create child session + add task
      await context.call('sessions', 'session.create', {
        sessionKey: childKey,
        kind: 'subagent',
        agentId: params.agentId,
        label: params.label ?? `Task: ${params.task.slice(0, 30)}...`,
        metadata: { parentSessionKey: context.sessionKey, model: params.model },
      });

      await context.call('sessions', 'session.addMessage', {
        sessionKey: childKey,
        content: params.task,
        role: 'user',
        metadata: { type: 'task' },
      });

      // Fire agent.run in background — don't await
      context.call('agent', 'agent.run', {
        sessionKey: childKey,
        task: params.task,
        model: params.model,
      }).catch(err => {
        log.error(`Subagent ${childKey} failed:`, err instanceof Error ? err.message : err);
      });

      return textResult(
        `Spawned sub-agent session: ${childKey}\n` +
        `Task: ${params.task}\n\n` +
        `The sub-agent is running in the background.\n` +
        `Use sessions_list to check status, sessions_history to view transcript.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions spawn failed: ${message}`);
    }
  },
};
