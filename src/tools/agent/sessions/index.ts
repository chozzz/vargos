/**
 * Sessions tool extension — list, inspect, send, spawn, and delete sessions
 */

import { z } from 'zod';
import type { VargosExtension, ExtensionContext } from '../../extension.js';
import type { ToolContext } from '../../types.js';
import { defineGatewayTool, textResult, errorResult } from '../../lib/gateway-tool.js';
import { toMessage } from '../../../lib/error.js';
import {
  canSpawnSubagent,
  subagentSessionKey,
  DEFAULT_MAX_CHILDREN,
  DEFAULT_MAX_SPAWN_DEPTH,
  DEFAULT_RUN_TIMEOUT_SECONDS,
} from '../../../lib/subagent.js';
import { loadConfig } from '../../../config/pi-config.js';
import { resolveDataDir } from '../../../config/paths.js';
import { loadAgent } from '../../../lib/agents.js';
import { loadSkill } from '../../../lib/skills.js';
import { createLogger } from '../../../lib/logger.js';

// --- Schemas ---

const SessionsListParameters = z.object({
  kinds: z.array(z.enum(['main', 'subagent'])).optional().describe('Filter by session kinds'),
  limit: z.number().optional().describe('Maximum number of sessions to return'),
  messageLimit: z.number().optional().describe('Include last N messages per session'),
});

const SessionsHistoryParameters = z.object({
  sessionKey: z.string().describe('Target session key'),
  limit: z.number().optional().describe('Maximum number of messages to return'),
  includeTools: z.boolean().optional().describe('Include tool calls and results'),
});

const SessionsSendParameters = z.object({
  sessionKey: z.string().describe('Target session key'),
  message: z.string().describe('Message to send'),
});

const SessionsDeleteParameters = z.object({
  sessionKey: z.string().describe('Session key to delete (use sessions_list to find keys)'),
});

const SessionsSpawnParameters = z.object({
  task: z.string().describe('Task description for the sub-agent'),
  agent: z.string().optional().describe('Named agent definition to use (loads from workspace/agents/<name>.md). Overrides role and pre-loads the agent\'s skills.'),
  skills: z.array(z.string()).optional().describe('Skills to load and inject into the sub-agent. Merged with agent skills if both set. Each skill name maps to workspace/skills/<name>/SKILL.md.'),
  role: z.string().optional().describe('Persona/role for the sub-agent. Overrides SOUL.md for this sub-agent. Ignored if agent or skills are set.'),
  agentId: z.string().optional().describe('Optional agent ID to use'),
  label: z.string().optional().describe('Optional label for the session'),
  model: z.string().optional().describe('Model to use (e.g., gpt-4o-mini)'),
  runTimeoutSeconds: z.number().optional().describe('Run timeout in seconds (default: from config or 300)'),
});

type ActiveRunsStatus = { activeRuns?: Array<{ sessionKey?: string }> };

const log = createLogger('sessions-spawn');

async function getActiveRuns(context: ToolContext): Promise<Array<{ sessionKey?: string }>> {
  const status = await context.call!('agent', 'agent.status', {});
  return (status as ActiveRunsStatus)?.activeRuns ?? [];
}

async function countActiveChildren(context: ToolContext): Promise<number> {
  try {
    const runs = await getActiveRuns(context);
    const prefix = context.sessionKey + ':subagent:';
    return runs.filter(r => r.sessionKey?.startsWith(prefix)).length;
  } catch {
    return 0;
  }
}

// --- Extension ---

export class SessionsExtension implements VargosExtension {
  readonly id = 'tools-sessions';
  readonly name = 'Sessions Tools';

  register(ctx: ExtensionContext): void {
    ctx.registerTool(defineGatewayTool({
      name: 'sessions_list',
      description: 'List sessions with optional filters and last messages',
      parameters: SessionsListParameters,
      service: 'sessions',
      method: 'session.list',
      formatCall: (args) => args.kinds ? `kinds=${String(args.kinds)}` : '',
      execute: async (params, call) => {
        const list = await call<any[]>('sessions', 'session.list', {
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
            const messages = await call<any[]>('sessions', 'session.getMessages', {
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
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'sessions_history',
      description: 'Fetch message history for a session',
      parameters: SessionsHistoryParameters,
      service: 'sessions',
      method: 'session.getMessages',
      formatCall: (args) => String(args.sessionKey || ''),
      execute: async (params, call) => {
        const session = await call<any>('sessions', 'session.get', { sessionKey: params.sessionKey });
        if (!session) return errorResult(`Session not found: ${params.sessionKey}`);

        const messages = await call<any[]>('sessions', 'session.getMessages', {
          sessionKey: params.sessionKey,
          limit: params.limit,
        });

        if (messages.length === 0) return textResult(`Session ${params.sessionKey} has no messages.`);

        const formatted = messages.map((msg, idx) => {
          const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'unknown';
          let text = `[${idx + 1}] ${timestamp} - ${msg.role}`;

          if (msg.metadata && Object.keys(msg.metadata).length > 0) {
            const meta = Object.entries(msg.metadata).map(([k, v]) => `${k}=${v}`).join(', ');
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
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'sessions_send',
      description: 'Send a message into another session',
      parameters: SessionsSendParameters,
      service: 'sessions',
      method: 'session.addMessage',
      formatCall: (args) => String(args.sessionKey || ''),
      execute: async (params, call) => {
        // Ensure session exists
        const session = await call('sessions', 'session.get', { sessionKey: params.sessionKey });
        if (!session) {
          await call('sessions', 'session.create', {
            sessionKey: params.sessionKey,
            kind: 'subagent',
          });
        }

        await call('sessions', 'session.addMessage', {
          sessionKey: params.sessionKey,
          content: params.message,
          role: 'user',
        });

        return textResult(`Message sent to session ${params.sessionKey}`);
      },
    }));

    ctx.registerTool(defineGatewayTool({
      name: 'sessions_delete',
      description: 'Delete a session and its message history. Use sessions_list to find session keys.',
      parameters: SessionsDeleteParameters,
      service: 'sessions',
      method: 'session.delete',
      formatCall: (args) => String(args.sessionKey || ''),
      execute: async ({ sessionKey }, call) => {
        await call('sessions', 'session.delete', { sessionKey });
        return textResult(`Deleted session: ${sessionKey}`);
      },
    }));

    // sessions_spawn has non-trivial orchestration logic — kept as inline tool
    ctx.registerTool({
      name: 'sessions_spawn',
      description: 'Spawn a background sub-agent run in an isolated session and announce result back',
      parameters: SessionsSpawnParameters,
      formatCall: (args) => `task=${String(args.task || '').slice(0, 80)}`,
      execute: async (args: unknown, context: ToolContext) => {
        const params = SessionsSpawnParameters.parse(args);
        if (!context.call) return errorResult('Gateway not available');

        try {
          const config = await loadConfig(resolveDataDir());
          const subagentCfg = config?.agent?.subagents;
          const maxDepth = subagentCfg?.maxSpawnDepth ?? DEFAULT_MAX_SPAWN_DEPTH;
          const maxChildren = subagentCfg?.maxChildren ?? DEFAULT_MAX_CHILDREN;
          const defaultTimeout = subagentCfg?.runTimeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;

          if (!canSpawnSubagent(context.sessionKey, maxDepth)) {
            return errorResult(`Maximum sub-agent nesting depth (${maxDepth}) reached.`);
          }

          const activeChildren = await countActiveChildren(context);
          if (activeChildren >= maxChildren) {
            return errorResult(`Maximum active sub-agents (${maxChildren}) reached. Wait for existing sub-agents to complete.`);
          }

          const childKey = subagentSessionKey(context.sessionKey);
          const timeout = params.runTimeoutSeconds ?? defaultTimeout;

          let role = params.role;
          let model = params.model;
          const skillNames: string[] = [];

          if (params.agent) {
            const agentDef = await loadAgent(context.workingDir, params.agent);
            if (agentDef) {
              skillNames.push(...agentDef.skills);
              if (agentDef.model && !model) model = agentDef.model;
              log.info(`loaded agent: ${params.agent} (${agentDef.skills.length} skills)`);
            } else {
              log.info(`agent not found: ${params.agent}, using role as fallback`);
            }
          }

          if (params.skills?.length) {
            for (const s of params.skills) {
              if (!skillNames.includes(s)) skillNames.push(s);
            }
          }

          if (skillNames.length) {
            const parts: string[] = [];
            for (const name of skillNames) {
              const content = await loadSkill(context.workingDir, name);
              if (content) parts.push(content);
              else log.info(`skill not found: ${name}`);
            }
            if (parts.length) role = parts.join('\n\n---\n\n');
            log.info(`injected ${parts.length} skills: ${skillNames.join(', ')}`);
          }

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
          return errorResult(`Sessions spawn failed: ${toMessage(err)}`);
        }
      },
    });
  }
}
