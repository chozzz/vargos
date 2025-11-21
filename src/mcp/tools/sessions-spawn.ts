/**
 * Sessions spawn tool - Spawns a Pi agent subagent
 * Works with file-based or postgres backends
 */

import { z } from 'zod';
import path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from './types.js';
import { getSessionService } from '../../services/factory.js';
import { getPiAgentRuntime } from '../../pi/runtime.js';
import { isSubagentSessionKey } from '../../agent/prompt.js';

const SessionsSpawnParameters = z.object({
  task: z.string().describe('Task description for the sub-agent'),
  agentId: z.string().optional().describe('Optional agent ID to use'),
  label: z.string().optional().describe('Optional label for the session'),
  model: z.string().optional().describe('Model to use (e.g., gpt-4o-mini)'),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional().describe('Thinking level'),
  runTimeoutSeconds: z.number().optional().describe('Timeout in seconds (0 = no timeout)'),
  cleanup: z.enum(['delete', 'keep']).optional().default('keep').describe('Session cleanup after completion'),
});

export const sessionsSpawnTool: Tool = {
  name: 'sessions_spawn',
  description: 'Spawn a background sub-agent run in an isolated session and announce result back',
  parameters: SessionsSpawnParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = SessionsSpawnParameters.parse(args);

    try {
      // Check if we're already in a subagent (prevent nested spawning)
      if (isSubagentSessionKey(context.sessionKey)) {
        return errorResult('Sub-agents cannot spawn other sub-agents.');
      }

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

      // Create child session key
      const childKey = `agent:${params.agentId ?? 'default'}:subagent:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Create child session
      const childSession = await sessions.create({
        sessionKey: childKey,
        kind: 'subagent',
        agentId: params.agentId,
        label: params.label ?? `Task: ${params.task.slice(0, 30)}...`,
        metadata: {
          parentSessionKey: context.sessionKey,
          model: params.model,
          thinking: params.thinking,
          timeout: params.runTimeoutSeconds,
        },
      });

      // Add task as first message
      await sessions.addMessage({
        sessionKey: childKey,
        content: params.task,
        role: 'user',
        metadata: { type: 'task' },
      });

      // Start Pi agent runtime for the subagent
      const runtime = getPiAgentRuntime();

      // Get session file path for Pi SDK
      const childSessionFile = path.join(context.workingDir, '.vargos', 'sessions', `${childKey.replace(/:/g, '-')}.jsonl`);

      // Run in background (don't await)
      runtime
        .runSubagent(
          {
            sessionKey: childKey,
            sessionFile: childSessionFile,
            workspaceDir: context.workingDir,
            model: params.model,
            extraSystemPrompt: `You are a sub-agent spawned to complete a specific task. Focus on the task and return results concisely.`,
            contextFiles: [],
          },
          context.sessionKey
        )
        .then((result) => {
          console.log(`Subagent ${childKey} completed:`, result.success ? 'success' : 'error');
        })
        .catch((err) => {
          console.error(`Subagent ${childKey} failed:`, err);
        });

      return textResult(
        `Spawned sub-agent session: ${childKey}\n` +
          `Task: ${params.task}\n\n` +
          `The sub-agent is running in the background. You will receive an announcement when it completes.\n` +
          `Use sessions_list to check status, sessions_history to view transcript.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Sessions spawn failed: ${message}`);
    }
  },
};
