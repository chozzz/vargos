/**
 * Agent-facing tools: sessions, cron, channel ops, config, skills, agent status.
 * These call other services via context.bus.
 */

import { z } from 'zod';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { textResult, errorResult } from './types.js';
import { toMessage } from '../../lib/error.js';
import { loadSkill } from '../../lib/skills.js';
import { loadAgent } from '../../lib/agents.js';
import { createLogger } from '../../lib/logger.js';
import { getDataPaths } from '../../lib/paths.js';
import {
  canSpawnSubagent, subagentSessionKey,
  DEFAULT_MAX_CHILDREN, DEFAULT_MAX_SPAWN_DEPTH, DEFAULT_RUN_TIMEOUT_SECONDS,
} from '../../lib/subagent.js';

const log = createLogger('tools');

// ── Helper ────────────────────────────────────────────────────────────────────

async function countActiveChildren(bus: ToolContext['bus'], sessionKey: string): Promise<number> {
  try {
    const status = await bus.call('agent.status', {});
    const runs   = status.activeRuns;
    const prefix = sessionKey + ':subagent:';
    return runs.filter(r => r.startsWith(prefix)).length;
  } catch {
    return 0;
  }
}

// ── sessions_list ─────────────────────────────────────────────────────────────

export const sessionsListTool: Tool = {
  name: 'sessions_list',
  description: 'List sessions with optional filters. Shows session key, kind, and recent messages.',
  parameters: z.object({
    kinds:        z.array(z.enum(['main', 'subagent', 'cron'])).optional(),
    limit:        z.number().optional().describe('Max sessions (default 20)'),
    messageLimit: z.number().optional().describe('Last N messages per session to include'),
  }),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ kinds: z.array(z.string()).optional(), limit: z.number().optional(), messageLimit: z.number().optional() })).parse(args);
    try {
      const result = await context.bus.call('session.search', { query: undefined, page: 1, limit: p.limit ?? 20 });
      const sessions = result.items;
      if (!sessions.length) return textResult('No sessions found.');

      const messageLimit = Math.min(p.messageLimit ?? 0, 10);
      const lines: string[] = [`Sessions (${sessions.length}):`];

      for (const s of sessions) {
        let line = `\n${s.sessionKey}  [${s.kind}]`;
        if (s.label) line += `  "${s.label}"`;
        line += `  updated ${new Date(s.updatedAt).toISOString()}`;
        lines.push(line);

        if (messageLimit > 0) {
          const msgs = await context.bus.call('session.getMessages', { sessionKey: s.sessionKey, limit: messageLimit });
          for (const m of msgs.slice(-messageLimit)) {
            lines.push(`  [${m.role}] ${m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}`);
          }
        }
      }
      return textResult(lines.join('\n'));
    } catch (err) {
      return errorResult(`sessions_list failed: ${toMessage(err)}`);
    }
  },
};

// ── sessions_history ──────────────────────────────────────────────────────────

export const sessionsHistoryTool: Tool = {
  name: 'sessions_history',
  description: 'Fetch message history for a session.',
  parameters: z.object({
    sessionKey: z.string(),
    limit:      z.number().optional().describe('Max messages'),
  }),
  formatCall: (args) => String(args.sessionKey || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ sessionKey: z.string(), limit: z.number().optional() })).parse(args);
    try {
      const session = await context.bus.call('session.get', { sessionKey: p.sessionKey }).catch(() => null);
      if (!session) return errorResult(`Session not found: ${p.sessionKey}`);
      const messages = await context.bus.call('session.getMessages', { sessionKey: p.sessionKey, limit: p.limit });
      if (!messages.length) return textResult(`No messages in ${p.sessionKey}`);
      const formatted = messages.map((m, i) =>
        `[${i + 1}] ${new Date(m.timestamp).toISOString()} ${m.role}:\n${m.content}`,
      ).join('\n\n');
      return textResult(`Session: ${p.sessionKey} (${session.kind})\n---\n\n${formatted}`);
    } catch (err) {
      return errorResult(`sessions_history failed: ${toMessage(err)}`);
    }
  },
};

// ── sessions_send ─────────────────────────────────────────────────────────────

export const sessionsSendTool: Tool = {
  name: 'sessions_send',
  description: 'Send a message into another session.',
  parameters: z.object({
    sessionKey: z.string(),
    message:    z.string(),
  }),
  formatCall: (args) => String(args.sessionKey || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ sessionKey: z.string(), message: z.string() })).parse(args);
    try {
      await context.bus.call('session.addMessage', { sessionKey: p.sessionKey, role: 'user', content: p.message });
      return textResult(`Message sent to ${p.sessionKey}`);
    } catch (err) {
      return errorResult(`sessions_send failed: ${toMessage(err)}`);
    }
  },
};

// ── sessions_delete ───────────────────────────────────────────────────────────

export const sessionsDeleteTool: Tool = {
  name: 'sessions_delete',
  description: 'Delete a session and its message history.',
  parameters: z.object({ sessionKey: z.string() }),
  formatCall: (args) => String(args.sessionKey || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ sessionKey: z.string() })).parse(args);
    try {
      await context.bus.call('session.delete', { sessionKey: p.sessionKey });
      return textResult(`Deleted session: ${p.sessionKey}`);
    } catch (err) {
      return errorResult(`sessions_delete failed: ${toMessage(err)}`);
    }
  },
};

// ── sessions_spawn ────────────────────────────────────────────────────────────

export const sessionsSpawnTool: Tool = {
  name: 'sessions_spawn',
  description: 'Spawn a background sub-agent in an isolated session. Results are announced back when complete.',
  parameters: z.object({
    task:               z.string().describe('Task description for the sub-agent'),
    agent:              z.string().optional().describe('Named agent to load from workspace/agents/'),
    skills:             z.array(z.string()).optional().describe('Skills to inject'),
    role:               z.string().optional().describe('Custom role/persona (overrides SOUL.md)'),
    label:              z.string().optional().describe('Optional session label'),
    model:              z.string().optional().describe('Model override'),
    runTimeoutSeconds:  z.number().optional().describe('Timeout in seconds (default 300)'),
  }),
  formatCall: (args) => String(args.task || '').slice(0, 80),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({
      task: z.string(), agent: z.string().optional(), skills: z.array(z.string()).optional(),
      role: z.string().optional(), label: z.string().optional(), model: z.string().optional(),
      runTimeoutSeconds: z.number().optional(),
    })).parse(args);

    try {
      const config = await context.bus.call('config.get', {});
      const subagentCfg = config.agent.subagents;
      const maxDepth    = subagentCfg.maxSpawnDepth;
      const maxChildren = DEFAULT_MAX_CHILDREN;
      const defaultTimeout = subagentCfg.runTimeoutSeconds;

      if (!canSpawnSubagent(context.sessionKey, maxDepth)) {
        return errorResult(`Max sub-agent nesting depth (${maxDepth}) reached.`);
      }

      const activeChildren = await countActiveChildren(context.bus, context.sessionKey);
      if (activeChildren >= maxChildren) {
        return errorResult(`Max active sub-agents (${maxChildren}) reached.`);
      }

      const childKey   = subagentSessionKey(context.sessionKey);
      const timeout    = p.runTimeoutSeconds ?? defaultTimeout;
      const { workspaceDir } = getDataPaths();

      let role         = p.role;
      let model        = p.model;
      const skillNames: string[] = [];

      if (p.agent) {
        const agentDef = await loadAgent(workspaceDir, p.agent);
        if (agentDef) {
          skillNames.push(...agentDef.skills);
          if (agentDef.model && !model) model = agentDef.model;
          log.info(`loaded agent: ${p.agent}`);
        }
      }

      if (p.skills?.length) {
        for (const s of p.skills) {
          if (!skillNames.includes(s)) skillNames.push(s);
        }
      }

      if (skillNames.length) {
        const parts: string[] = [];
        for (const name of skillNames) {
          const content = await loadSkill(workspaceDir, name);
          if (content) parts.push(content);
        }
        if (parts.length) role = parts.join('\n\n---\n\n');
      }

      await context.bus.call('session.create', {
        sessionKey: childKey,
        metadata:   { parentSessionKey: context.sessionKey, ...(model ? { model } : {}) },
      });
      await context.bus.call('session.addMessage', {
        sessionKey: childKey, role: 'user', content: p.task,
      });

      // Fire agent.execute in background
      context.bus.call('agent.execute', {
        sessionKey: childKey,
        task:       p.task,
        ...(model ? { model } : {}),
      }).catch(err => log.error(`subagent ${childKey} failed: ${toMessage(err)}`));

      if (timeout > 0) {
        setTimeout(async () => {
          try {
            const status = await context.bus.call('agent.status', { sessionKey: childKey });
            if (status.activeRuns.includes(childKey)) {
              log.info(`subagent ${childKey} timed out — aborting`);
              await context.bus.call('agent.abort', { sessionKey: childKey });
            }
          } catch { /* ignore */ }
        }, timeout * 1000);
      }

      return textResult(
        `Spawned sub-agent: ${childKey}\nTask: ${p.task}\nTimeout: ${timeout}s\n\n` +
        `Running in background. Results will be announced when complete.`,
      );
    } catch (err) {
      return errorResult(`sessions_spawn failed: ${toMessage(err)}`);
    }
  },
};

// ── cron_list / cron_add / cron_remove / cron_run / cron_update ───────────────

export const cronListTool: Tool = {
  name: 'cron_list',
  description: 'List all scheduled cron tasks.',
  parameters: z.object({}),
  async execute(_args: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await context.bus.call('cron.search', { page: 1, limit: 100 });
      const tasks  = result.items;
      if (!tasks.length) return textResult('No scheduled tasks. Use cron_add to create one.');
      const lines = tasks.map(t =>
        `${t.id}  ${t.enabled ? '✓' : '○'}  ${t.schedule}  ${t.name}`,
      );
      return textResult(`Scheduled tasks (${tasks.length}):\n\n${lines.join('\n')}`);
    } catch (err) {
      return errorResult(`cron_list failed: ${toMessage(err)}`);
    }
  },
};

export const cronAddTool: Tool = {
  name: 'cron_add',
  description: 'Schedule a recurring task. Runs on a cron schedule.',
  parameters: z.object({
    id:       z.string().describe('Unique task ID'),
    schedule: z.string().describe('Cron expression (e.g., "0 * * * *")'),
    task:     z.string().describe('Task to run'),
    name:     z.string().optional(),
    notify:   z.array(z.string()).optional().describe('Notify targets (e.g., ["whatsapp:614..."])'),
  }),
  formatCall: (args) => `${args.id} ${args.schedule}`,
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ id: z.string(), schedule: z.string(), task: z.string(), name: z.string().optional(), notify: z.array(z.string()).optional() })).parse(args);
    try {
      await context.bus.call('cron.add', { ...p, name: p.name ?? p.id });
      return textResult(`Scheduled task created: ${p.id} (${p.schedule})`);
    } catch (err) {
      return errorResult(`cron_add failed: ${toMessage(err)}`);
    }
  },
};

export const cronRemoveTool: Tool = {
  name: 'cron_remove',
  description: 'Remove a scheduled task by ID.',
  parameters: z.object({ id: z.string() }),
  formatCall: (args) => String(args.id || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ id: z.string() })).parse(args);
    try {
      await context.bus.call('cron.remove', { id: p.id });
      return textResult(`Removed task: ${p.id}`);
    } catch (err) {
      return errorResult(`cron_remove failed: ${toMessage(err)}`);
    }
  },
};

export const cronRunTool: Tool = {
  name: 'cron_run',
  description: 'Trigger immediate execution of a scheduled task.',
  parameters: z.object({ id: z.string() }),
  formatCall: (args) => String(args.id || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ id: z.string() })).parse(args);
    try {
      await context.bus.call('cron.run', { id: p.id });
      return textResult(`Triggered: ${p.id}`);
    } catch (err) {
      return errorResult(`cron_run failed: ${toMessage(err)}`);
    }
  },
};

export const cronUpdateTool: Tool = {
  name: 'cron_update',
  description: 'Update a scheduled task.',
  parameters: z.object({
    id:       z.string(),
    name:     z.string().optional(),
    schedule: z.string().optional(),
    task:     z.string().optional(),
    enabled:  z.boolean().optional(),
    notify:   z.array(z.string()).optional(),
  }),
  formatCall: (args) => String(args.id || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ id: z.string(), name: z.string().optional(), schedule: z.string().optional(), task: z.string().optional(), enabled: z.boolean().optional(), notify: z.array(z.string()).optional() })).parse(args);
    try {
      await context.bus.call('cron.update', p);
      return textResult(`Updated task: ${p.id}`);
    } catch (err) {
      return errorResult(`cron_update failed: ${toMessage(err)}`);
    }
  },
};

// ── skill_load ────────────────────────────────────────────────────────────────

export const skillLoadTool: Tool = {
  name: 'skill_load',
  description: 'Load a skill by name to get its full instructions.',
  parameters: z.object({
    name: z.string().describe('Skill name (directory name under skills/)'),
  }),
  formatCall: (args) => String(args.name || ''),
  async execute(args: unknown): Promise<ToolResult> {
    const p = (z.object({ name: z.string() })).parse(args);
    try {
      const { workspaceDir } = getDataPaths();
      const content = await loadSkill(workspaceDir, p.name);
      if (!content) return errorResult(`Skill not found: ${p.name}`);
      return textResult(content);
    } catch (err) {
      return errorResult(`skill_load failed: ${toMessage(err)}`);
    }
  },
};

// ── config_read ───────────────────────────────────────────────────────────────

export const configReadTool: Tool = {
  name: 'config_read',
  description: 'Read current Vargos configuration. API keys are masked.',
  parameters: z.object({
    section: z.enum(['models', 'agent', 'channels', 'cron', 'gateway', 'mcp', 'paths']).optional(),
  }),
  formatCall: (args) => String(args.section || 'full'),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ section: z.string().optional() })).parse(args);
    try {
      const config = await context.bus.call('config.get', {});
      const data   = p.section ? (config as Record<string, unknown>)[p.section] : config;
      // Mask secrets
      const masked = JSON.parse(JSON.stringify(data), (_k, v) =>
        typeof v === 'string' && /api.?key|token|secret|password/i.test(_k)
          ? v.slice(0, 4) + '****'
          : v,
      );
      return textResult(JSON.stringify(masked, null, 2));
    } catch (err) {
      return errorResult(`config_read failed: ${toMessage(err)}`);
    }
  },
};

// ── agent_status ──────────────────────────────────────────────────────────────

export const agentStatusTool: Tool = {
  name: 'agent_status',
  description: 'Show currently active agent runs.',
  parameters: z.object({}),
  async execute(_args: unknown, context: ToolContext): Promise<ToolResult> {
    try {
      const status = await context.bus.call('agent.status', {});
      const runs   = status.activeRuns;
      if (!runs.length) return textResult('No active runs.');
      return textResult(`Active runs (${runs.length}):\n${runs.join('\n')}`);
    } catch (err) {
      return errorResult(`agent_status failed: ${toMessage(err)}`);
    }
  },
};

// ── channel_send_media ────────────────────────────────────────────────────────

export const channelSendMediaTool: Tool = {
  name: 'channel_send_media',
  description: 'Send a media file (image, audio, video, document) to the current channel session.',
  parameters: z.object({
    filePath: z.string().describe('Absolute path to the file to send'),
    mimeType: z.string().describe('MIME type, e.g. image/png'),
    caption:  z.string().optional().describe('Optional caption'),
  }),
  formatCall: (args) => String(args.filePath || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ filePath: z.string(), mimeType: z.string(), caption: z.string().optional() })).parse(args);
    try {
      await context.bus.call('channel.sendMedia', {
        sessionKey: context.sessionKey,
        filePath:   p.filePath,
        mimeType:   p.mimeType,
        caption:    p.caption,
      });
      return textResult(`Sent media: ${p.filePath}`);
    } catch (err) {
      return errorResult(`channel_send_media failed: ${toMessage(err)}`);
    }
  },
};

// ── All agent tools ───────────────────────────────────────────────────────────

export const agentTools: Tool[] = [
  sessionsListTool,
  sessionsHistoryTool,
  sessionsSendTool,
  sessionsDeleteTool,
  sessionsSpawnTool,
  cronListTool,
  cronAddTool,
  cronRemoveTool,
  cronRunTool,
  cronUpdateTool,
  skillLoadTool,
  configReadTool,
  agentStatusTool,
  channelSendMediaTool,
];
