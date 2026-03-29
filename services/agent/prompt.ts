/**
 * System prompt builder for Vargos
 * Assembles context from workspace bootstrap files
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toolRegistry } from '../tools/registry.js';
import { isSubagentSessionKey } from '../../lib/subagent.js';
import { scanSkills } from '../../lib/skills.js';
import { scanAgents } from '../../lib/agents.js';

export type PromptMode = 'full' | 'minimal' | 'minimal-subagent' | 'none';

export interface SystemPromptOptions {
  mode: PromptMode;
  workspaceDir: string;
  toolNames: string[];
  extraSystemPrompt?: string;
  userTimezone?: string;
  repoRoot?: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  channel?: string;
  bootstrapOverrides?: Record<string, string>;
  sessionKey?: string;
}

const BOOTSTRAP_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'];
const DEFAULT_BOOTSTRAP_MAX_CHARS = 6000;

export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  const { mode, workspaceDir, toolNames, userTimezone, repoRoot, model, thinking } = options;

  if (mode === 'none') return 'You are a helpful assistant.';

  const sections: string[] = [];

  sections.push(buildIdentitySection());
  sections.push(await buildToolingSection(toolNames));
  sections.push(buildWorkspaceSection(workspaceDir));

  if (mode === 'full' && !options.channel) {
    sections.push(buildCodebaseContextSection(workspaceDir));
  }

  if (mode === 'full' || mode === 'minimal-subagent') {
    sections.push(buildOrchestrationSection(options.sessionKey));
  }

  if (mode === 'full') {
    sections.push(buildMemorySection());
  }

  if (mode !== 'minimal-subagent') {
    sections.push(buildHeartbeatSection());
  }

  const bootstrapContent = await loadBootstrapFiles(workspaceDir, options.bootstrapOverrides);
  if (bootstrapContent) sections.push(bootstrapContent);

  if (mode !== 'minimal-subagent') {
    const skillsSection = await buildSkillsSection(workspaceDir);
    if (skillsSection) sections.push(skillsSection);
    const agentsSection = await buildAgentsSection(workspaceDir);
    if (agentsSection) sections.push(agentsSection);
  }

  if (mode === 'full') {
    sections.push(buildToolNarrationSection());
  }

  if (options.channel) {
    sections.push(buildChannelSection(options.channel, options.sessionKey));
  }

  sections.push(buildSystemSection({ userTimezone, repoRoot, model, thinking }));

  if (options.extraSystemPrompt) {
    sections.push(`## Additional Context\n\n${options.extraSystemPrompt}`);
  }

  if (options.channel) {
    sections.push(buildChannelReminder());
  }

  return sections.filter(Boolean).join('\n\n');
}

async function buildToolingSection(toolNames: string[]): Promise<string> {
  const { external } = toolRegistry.getGroups();
  const externalNames = new Set<string>();
  for (const tools of external.values()) {
    for (const t of tools) externalNames.add(t.name);
  }

  const builtinCount = toolNames.filter(n => !externalNames.has(n)).length;

  const lines = [
    '## Tooling',
    '',
    `${builtinCount} built-in tools available (schemas provided via tool definitions).`,
    'Use tools naturally. Wait for results before proceeding.',
  ];

  if (external.size > 0) {
    const toolNameSet = new Set(toolNames);
    lines.push('', '### Connected External Tools', '',
      'These tools are live — call them directly like any other tool.');
    for (const [server, tools] of external) {
      const visible = tools.filter(t => toolNameSet.has(t.name));
      if (visible.length === 0) continue;
      lines.push('', `**${server}** (${visible.length} tools):`);
      for (const tool of visible) {
        lines.push(`- ${tool.name}: ${tool.description}`);
      }
    }
  }

  lines.push(
    '', '### Shell & Git', '',
    'The `exec` tool runs any shell command. Common patterns:',
    '- Git: clone, checkout -b, push, diff, log',
    '- GitHub CLI: gh repo clone, gh pr create, gh issue list',
    '- Node/Python: npm install, pnpm build, pip install',
    '- System: ls, find, grep, curl, wget',
    '',
    'For long-running commands, use `process` to run in background.',
  );

  return lines.join('\n');
}

function buildWorkspaceSection(workspaceDir: string): string {
  return [
    '## Workspace', '',
    `Working directory: ${workspaceDir}`, '',
    'Consult AGENTS.md and TOOLS.md when you need workspace rules or tool notes for a task.',
  ].join('\n');
}

function buildMemorySection(): string {
  return [
    '## Memory Recall', '',
    'When the user asks about prior work, decisions, dates, people, preferences, or todos:',
    '1. Run `memory_search` on MEMORY.md + memory/*.md',
    '2. Use `memory_get` to pull only the needed lines',
    '3. If nothing found, say so',
    '',
    'Only search memory when the question actually requires it — not on greetings or small talk.',
  ].join('\n');
}

function buildHeartbeatSection(): string {
  return [
    '## Heartbeats', '',
    'When you receive a heartbeat poll, read HEARTBEAT.md for pending tasks.',
    'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
    'If something needs attention, reply with the alert text — do NOT include HEARTBEAT_OK.',
  ].join('\n');
}

function buildToolNarrationSection(): string {
  return [
    '## Tool Call Style', '',
    'Default: do not narrate routine, low-risk tool calls (just call the tool).',
    'Narrate only when it helps: multi-step work, complex problems, sensitive actions (e.g. deletions), or when the user explicitly asks.',
    'Keep narration brief and value-dense; avoid repeating obvious steps.',
  ].join('\n');
}

async function loadBootstrapFiles(
  workspaceDir: string,
  overrides?: Record<string, string>,
): Promise<string | null> {
  const lines: string[] = [];
  let hasSoulFile = false;

  for (const filename of BOOTSTRAP_FILES) {
    let content: string;

    if (overrides?.[filename] !== undefined) {
      content = overrides[filename];
    } else {
      try {
        content = await fs.readFile(path.join(workspaceDir, filename), 'utf-8');
      } catch {
        continue;
      }
    }

    if (!content.trim()) continue;
    if (filename === 'SOUL.md') hasSoulFile = true;

    const maxChars = DEFAULT_BOOTSTRAP_MAX_CHARS;
    let displayContent = content;

    if (content.length > maxChars) {
      const headChars = Math.floor(maxChars * 0.7);
      const tailChars = Math.floor(maxChars * 0.2);
      displayContent = `${content.slice(0, headChars)}\n\n[...truncated, read ${filename} for full content...]\n\n${content.slice(-tailChars)}`;
    }

    lines.push(`<!-- ${filename} -->`, displayContent, '');
  }

  if (hasSoulFile) {
    lines.push('Embody the persona defined in SOUL.md. Avoid stiff, generic replies.', '');
  }

  if (lines.length === 0) return null;
  return ['## Project Context', '', ...lines].join('\n');
}

function buildChannelSection(channel: string, sessionKey?: string): string {
  const userId = sessionKey?.startsWith(`${channel}:`)
    ? sessionKey.slice(channel.length + 1).split(':')[0]
    : undefined;

  const lines = ['## Channel', '', `This message arrived via: ${channel}`];
  if (userId) lines.push(`Channel: ${channel}, userId: ${userId}`);

  lines.push(
    '',
    'MEDIA DELIVERY (MANDATORY):',
    `When the user asks you to send, show, or share a file — you MUST call channel_send_media with channel="${channel}"${userId ? `, userId="${userId}"` : ''}, the file path, and correct MIME type. Do NOT describe the file or print the path. SEND IT.`,
    '',
    'Channel rules (this chat renders plain text only — markdown symbols appear as literal characters):',
    '- Write in short, plain text sentences. 1-3 sentences for simple answers.',
    '- Use line breaks and spacing for structure. Bullets with "•" are fine.',
    '- Run code with exec instead of showing it. The user reads results, not source.',
    '- Call tools immediately — say what you found, not what you plan to do.',
    '- All tools listed above are available. Use them.',
    '- If a tool fails, report the error briefly.',
    '- After generating any media file, call channel_send_media to deliver it directly.',
    '- User messages may have contained /think or /verbose directives — these are stripped before you see the message.',
  );

  return lines.join('\n');
}

function buildChannelReminder(): string {
  return [
    '## Reminder', '',
    'This is a plain-text chat. Write plain text only — no markdown syntax.',
    'Deliver media files via channel_send_media, not as text paths.',
  ].join('\n');
}

function buildSystemSection(options: {
  userTimezone?: string;
  repoRoot?: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
}): string {
  const now = new Date();
  const tz = options.userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const dp = Object.fromEntries(dateParts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

  const lines = [
    '## System', '',
    `Date: ${dp.year}-${dp.month}-${dp.day}`,
    `Time: ${now.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false })} (${tz})`,
    `OS: ${process.platform} ${process.arch}`,
    `Host: ${os.hostname()}`,
  ];

  const info: string[] = ['host=vargos'];
  if (options.repoRoot) info.push(`repo=${options.repoRoot}`);
  if (options.model) info.push(`model=${options.model}`);
  if (options.thinking && options.thinking !== 'off') info.push(`thinking=${options.thinking}`);
  lines.push(`Runtime: ${info.join(', ')}`);

  return lines.join('\n');
}

function buildIdentitySection(): string {
  return [
    '## Identity', '',
    'You are an AI agent running on the Vargos platform.',
    'Your name, personality, and working style are defined in SOUL.md below.',
    '',
    'Respond naturally to conversation. Only use tools when the task requires them.',
    'Do NOT read workspace files or search memory on casual messages like greetings or small talk.',
  ].join('\n');
}

function buildCodebaseContextSection(workspaceDir: string): string {
  return [
    '## Codebase', '',
    `Working in: ${workspaceDir}`, '',
    'Explore the codebase structure before making assumptions.',
    'Use ls, read, and grep to understand the actual code.',
  ].join('\n');
}

function buildOrchestrationSection(sessionKey?: string): string {
  if (sessionKey && isSubagentSessionKey(sessionKey)) {
    return [
      '## Role: Focused Worker', '',
      'You are a sub-agent. Complete the assigned task directly.',
      'Do not spawn further sub-agents unless the task explicitly requires parallel work.',
      'Return a clear, concise result — your output will be synthesized by the parent agent.',
    ].join('\n');
  }

  return [
    '## Orchestration', '',
    'Act directly when:',
    '- The request is conversational (greetings, opinions, quick questions)',
    '- A single tool call or short sequence completes the task',
    '- The user asks for your direct judgment (summarize, explain, advise)',
    '',
    'Delegate via sessions_spawn when:',
    '- The task has two or more independent phases that can run in parallel',
    '- Execution will take more than a minute (research, file processing, builds)',
    '- The task touches multiple domains (e.g., fetch + analyze + write)',
    '',
    'When orchestrating:',
    '1. **Plan**: List numbered steps. For each, name the agent (or role) and relevant skills.',
    '2. **Execute**: Spawn agents per step (parallel where independent). Use `agent` for named definitions, `role` for ad-hoc personas.',
    '3. **Review**: Check results against plan. Re-plan if steps failed or are incomplete.',
    '4. **Synthesize**: Combine results into a coherent response. Report what was done and what it means.',
    '',
    'Examples:',
    '  sessions_spawn({ agent: "code-reviewer", task: "Review the auth module changes" })',
    '  sessions_spawn({ task: "Research AI ethics frameworks", role: "You are a research analyst. Focus on regulatory frameworks." })',
    '',
    'For large iterative tasks (process N items, scan N files, summarize N days):',
    '- Spawn a batch of sub-agents (up to the concurrency limit), not one mega-agent',
    '- Each sub-agent handles one item or a small group',
    '- On re-trigger, check progress and continue with the next batch until done',
    '- Report progress to the user between batches',
    '',
    'Do not spawn sub-agents for: time/date questions, status checks, single file reads,',
    'calculations, or tasks completable in one or two tool calls.',
  ].join('\n');
}

async function buildAgentsSection(workspaceDir: string): Promise<string | null> {
  const agents = await scanAgents(workspaceDir);
  if (agents.length === 0) return null;

  const lines = [
    '## Available Agents', '',
    'Use `sessions_spawn({ agent: "<name>", task: "..." })` to delegate to a specialist.',
    '',
    ...agents.map(a => {
      const extras: string[] = [];
      if (a.skills.length) extras.push(`skills: ${a.skills.join(', ')}`);
      if (a.model) extras.push(`model: ${a.model}`);
      const suffix = extras.length ? ` [${extras.join('; ')}]` : '';
      return `- **${a.name}**: ${a.description}${suffix}`;
    }),
  ];

  return lines.join('\n');
}

async function buildSkillsSection(workspaceDir: string): Promise<string | null> {
  const skills = await scanSkills(workspaceDir);
  if (skills.length === 0) return null;

  const lines = [
    '## Available Skills', '',
    'Load a skill with `skill_load` to get full instructions.',
    '',
    ...skills.map(s => {
      const tags = s.tags.length ? ` [${s.tags.join(', ')}]` : '';
      return `- **${s.name}**: ${s.description}${tags}`;
    }),
  ];

  return lines.join('\n');
}

/** Resolve prompt mode based on session key. */
export function resolvePromptMode(sessionKey: string): PromptMode {
  const root = sessionKey.split(':subagent:')[0];
  if (root.startsWith('cron:')) return 'minimal';
  if (isSubagentSessionKey(sessionKey)) return 'minimal-subagent';
  return 'full';
}
