/**
 * Sessions spawn tool - Spawn a sub-agent via gateway RPC
 * Enforces configurable depth and breadth limits from config.agent.subagents
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';
import { toMessage } from '../../lib/error.js';
import {
  canSpawnSubagent,
  subagentSessionKey,
  DEFAULT_MAX_CHILDREN,
  DEFAULT_MAX_SPAWN_DEPTH,
  DEFAULT_RUN_TIMEOUT_SECONDS,
} from '../../lib/subagent.js';
import { loadConfig } from '../../config/pi-config.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadAgent } from '../../lib/agents.js';
import { loadSkill } from '../../lib/skills.js';
import { createLogger } from '../../lib/logger.js';

type ActiveRunsStatus = { activeRuns?: Array<{ sessionKey?: string }> };

const log = createLogger('sessions-spawn');

const SessionsSpawnParameters = z.object({
  task: z.string().describe('Task description for the sub-agent'),
  agent: z.string().optional().describe('Named agent definition to use (loads from workspace/agents/<name>.md). Overrides role and pre-loads the agent\'s skills.'),
  role: z.string().optional().describe('Persona/role for the sub-agent. Overrides SOUL.md for this sub-agent. Ignored if agent is set.'),
  agentId: z.string().optional().describe('Optional agent ID to use'),
  label: z.string().optional().describe('Optional label for the session'),
  model: z.string().optional().describe('Model to use (e.g., gpt-4o-mini)'),
  runTimeoutSeconds: z.number().optional().describe('Run timeout in seconds (default: from config or 300)'),
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
      // Load config for subagent limits
      const config = await loadConfig(resolveDataDir());
      const subagentCfg = config?.agent?.subagents;
      const maxDepth = subagentCfg?.maxSpawnDepth ?? DEFAULT_MAX_SPAWN_DEPTH;
      const maxChildren = subagentCfg?.maxChildren ?? DEFAULT_MAX_CHILDREN;
      const defaultTimeout = subagentCfg?.runTimeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;

      // Depth check
      if (!canSpawnSubagent(context.sessionKey, maxDepth)) {
        return errorResult(`Maximum sub-agent nesting depth (${maxDepth}) reached.`);
      }

      // Breadth check — count active children for this parent
      const activeChildren = await countActiveChildren(context);
      if (activeChildren >= maxChildren) {
        return errorResult(`Maximum active sub-agents (${maxChildren}) reached. Wait for existing sub-agents to complete.`);
      }

      const childKey = subagentSessionKey(context.sessionKey);
      const timeout = params.runTimeoutSeconds ?? defaultTimeout;

      // Resolve agent definition if specified
      let role = params.role;
      let model = params.model;
      if (params.agent) {
        const agentDef = await loadAgent(context.workingDir, params.agent);
        if (agentDef) {
          const parts: string[] = [];
          for (const skillName of agentDef.skills) {
            const skillContent = await loadSkill(context.workingDir, skillName);
            if (skillContent) parts.push(skillContent);
          }
          if (parts.length) role = parts.join('\n\n---\n\n');
          if (agentDef.model && !model) model = agentDef.model;
          log.info(`loaded agent: ${params.agent} (${agentDef.skills.length} skills)`);
        } else {
          log.info(`agent not found: ${params.agent}, using role as fallback`);
        }
      }

      // Create child session
      await context.call('sessions', 'session.create', {
        sessionKey: childKey,
        kind: 'subagent',
        agentId: params.agentId,
        label: params.label ?? `Task: ${params.task.slice(0, 30)}...`,
        metadata: { parentSessionKey: context.sessionKey, model },
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
        model: model ?? subagentCfg?.model,
        ...(role && { bootstrapOverrides: { 'SOUL.md': role } }),
      }).catch(err => {
        log.error(`Subagent ${childKey} failed:`, toMessage(err));
      });

      // Enforce timeout — abort the child run if it exceeds the limit
      if (timeout > 0) {
        setTimeout(async () => {
          try {
            const runs = await getActiveRuns(context);
            if (runs.some(r => r.sessionKey === childKey)) {
              log.info(`Subagent ${childKey} timed out after ${timeout}s — aborting`);
              await context.call!('agent', 'agent.abort', {
                sessionKey: childKey,
                reason: `Timed out after ${timeout}s`,
              });
            }
          } catch (err) {
            log.error(`Timeout check failed for ${childKey}:`, toMessage(err));
          }
        }, timeout * 1000);
      }

      return textResult(
        `Spawned sub-agent: ${childKey}\n` +
        `Task: ${params.task}\n` +
        `Timeout: ${timeout > 0 ? `${timeout}s` : 'none'}\n\n` +
        `The sub-agent is running in the background. Results will be announced when complete.`
      );
    } catch (err) {
      const message = toMessage(err);
      return errorResult(`Sessions spawn failed: ${message}`);
    }
  },
};

async function getActiveRuns(context: ToolContext): Promise<Array<{ sessionKey?: string }>> {
  const status = await context.call!('agent', 'agent.status', {});
  return (status as ActiveRunsStatus)?.activeRuns ?? [];
}

/** Count active subagent runs for this parent session */
async function countActiveChildren(context: ToolContext): Promise<number> {
  try {
    const runs = await getActiveRuns(context);
    const prefix = context.sessionKey + ':subagent:';
    return runs.filter(r => r.sessionKey?.startsWith(prefix)).length;
  } catch {
    return 0; // Allow spawn if status check fails — timeout will guard
  }
}
