/**
 * System prompt builder for Vargos
 * System prompt assembly with bootstrap file injection
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toolRegistry } from '../tools/registry.js';
import { isSubagentSessionKey } from '../lib/subagent.js';

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

// Bootstrap files to inject (in priority order)
const BOOTSTRAP_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
];

const DEFAULT_BOOTSTRAP_MAX_CHARS = 20000;

/**
 * Build system prompt from workspace context files
 */
export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  const { mode, workspaceDir, toolNames, userTimezone, repoRoot, model, thinking } = options;

  if (mode === 'none') {
    return 'You are a helpful assistant.';
  }

  const sections: string[] = [];

  // 0. Identity — delegates to SOUL.md for persona details
  sections.push(buildIdentitySection());

  // 1. Tooling section
  sections.push(await buildToolingSection(toolNames));

  // 2. Workspace section
  sections.push(buildWorkspaceSection(workspaceDir));

  // 2.5 Codebase context — prevents hallucination about this project
  if (mode === 'full') {
    sections.push(await buildCodebaseContextSection(workspaceDir));
  }

  // 2.7 Orchestration guidance (full mode + subagent worker guidance)
  if (mode === 'full' || mode === 'minimal-subagent') {
    sections.push(buildOrchestrationSection(options.sessionKey));
  }

  // 3. Memory recall guidance (full mode, non-subagent)
  if (mode === 'full') {
    sections.push(buildMemorySection());
  }

  // 3.5 Heartbeat protocol (full + minimal — heartbeat runs use minimal)
  if (mode !== 'minimal-subagent') {
    sections.push(buildHeartbeatSection());
  }

  // 4. Bootstrap files (AGENTS.md, SOUL.md, TOOLS.md)
  const bootstrapContent = await loadBootstrapFiles(workspaceDir, options.bootstrapOverrides);
  if (bootstrapContent) {
    sections.push(bootstrapContent);
  }

  // 4.7 Tool narration guidance (full mode only)
  if (mode === 'full') {
    sections.push(buildToolNarrationSection());
  }

  // 5. Channel context (if from a messaging channel)
  if (options.channel) {
    sections.push(buildChannelSection(options.channel));
  }

  // 6. System info — date/time, OS, runtime
  sections.push(buildSystemSection({ userTimezone, repoRoot, model, thinking }));

  // 8. Extra prompt if provided
  if (options.extraSystemPrompt) {
    sections.push(`## Additional Context\n\n${options.extraSystemPrompt}`);
  }

  // Join all sections
  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build tooling section with detailed descriptions
 */
async function buildToolingSection(toolNames: string[]): Promise<string> {
  const { external } = toolRegistry.getGroups();
  const externalNames = new Set<string>();
  for (const tools of external.values()) {
    for (const t of tools) externalNames.add(t.name);
  }

  const lines = [
    '## Tooling',
    '',
    'Available tools (use exactly as listed):',
  ];

  for (const name of toolNames) {
    if (externalNames.has(name)) continue;
    const desc = toolRegistry.get(name)?.description || 'Available tool';
    lines.push(`- ${name}: ${desc}`);
  }

  if (external.size > 0) {
    const toolNameSet = new Set(toolNames);
    lines.push('');
    lines.push('### Connected External Tools');
    lines.push('');
    lines.push('These tools are live — call them directly like any other tool.');
    for (const [server, tools] of external) {
      const visible = tools.filter(t => toolNameSet.has(t.name));
      if (visible.length === 0) continue;
      lines.push('');
      lines.push(`**${server}** (${visible.length} tools):`);
      for (const tool of visible) {
        lines.push(`- ${tool.name}: ${tool.description}`);
      }
    }
  }

  lines.push(
    '',
    'Use tools naturally to complete tasks. When using tools, wait for results before proceeding.',
    'Tool names are case-sensitive. Call tools exactly as listed.',
    '',
    '### Shell & Git',
    '',
    'The `exec` tool runs any shell command. Common patterns:',
    '- **Git:** `git clone`, `git checkout -b`, `git push`, `git diff`, `git log`',
    '- **GitHub CLI:** `gh repo clone owner/repo`, `gh pr create`, `gh issue list`, `gh run list`',
    '- **Node/Python:** `npm install`, `pnpm build`, `pip install`, `python script.py`',
    '- **System:** `ls`, `find`, `grep`, `curl`, `wget`, `tar`, `zip`',
    '',
    'For long-running commands, use `process` to run in background and monitor with poll/log.',
    'Check TOOLS.md for environment-specific notes.',
  );

  return lines.join('\n');
}

/**
 * Build workspace section
 */
function buildWorkspaceSection(workspaceDir: string): string {
  return [
    '## Workspace',
    '',
    `Working directory: ${workspaceDir}`,
    '',
    'Consult AGENTS.md and TOOLS.md when you need workspace rules or tool notes for a task.',
  ].join('\n');
}

/**
 * Build memory recall guidance
 */
function buildMemorySection(): string {
  return [
    '## Memory Recall',
    '',
    'When the user asks about prior work, decisions, dates, people, preferences, or todos:',
    '1. Run `memory_search` on MEMORY.md + memory/*.md',
    '2. Use `memory_get` to pull only the needed lines',
    '3. If nothing found, say so',
    '',
    'Only search memory when the question actually requires it — not on greetings or small talk.',
  ].join('\n');
}

/**
 * Build heartbeat protocol guidance
 */
function buildHeartbeatSection(): string {
  return [
    '## Heartbeats',
    '',
    'When you receive a heartbeat poll, read HEARTBEAT.md for pending tasks.',
    'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
    'If something needs attention, reply with the alert text — do NOT include HEARTBEAT_OK.',
  ].join('\n');
}

/**
 * Tool narration guidance — reduces verbose tool-call commentary
 */
function buildToolNarrationSection(): string {
  return [
    '## Tool Call Style',
    '',
    'Default: do not narrate routine, low-risk tool calls (just call the tool).',
    'Narrate only when it helps: multi-step work, complex problems, sensitive actions (e.g. deletions), or when the user explicitly asks.',
    'Keep narration brief and value-dense; avoid repeating obvious steps.',
  ].join('\n');
}

/**
 * Load and inject bootstrap files.
 * Uses 70/20 head/tail truncation to preserve both beginning and end of large files.
 */
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
      const filepath = path.join(workspaceDir, filename);
      try {
        content = await fs.readFile(filepath, 'utf-8');
      } catch {
        continue;
      }
    }

    if (!content.trim()) continue;

    if (filename === 'SOUL.md') hasSoulFile = true;

    // 70/20 head/tail truncation — keeps start and end, drops middle
    const maxChars = DEFAULT_BOOTSTRAP_MAX_CHARS;
    let displayContent = content;

    if (content.length > maxChars) {
      const headChars = Math.floor(maxChars * 0.7);
      const tailChars = Math.floor(maxChars * 0.2);
      const head = content.slice(0, headChars);
      const tail = content.slice(-tailChars);
      displayContent = `${head}\n\n[...truncated, read ${filename} for full content...]\n\n${tail}`;
    }

    lines.push(`<!-- ${filename} -->`);
    lines.push(displayContent);
    lines.push('');
  }

  if (hasSoulFile) {
    lines.push('Embody the persona defined in SOUL.md. Avoid stiff, generic replies.');
    lines.push('');
  }

  if (lines.length === 0) return null;

  return [`## Project Context`, '', ...lines].join('\n');
}

/**
 * Build channel context section
 */
function buildChannelSection(channel: string): string {
  return [
    '## Channel',
    '',
    `This message arrived via: ${channel}`,
    '',
    'Channel rules:',
    '- Be short and direct. 1-3 sentences for simple answers. No filler, no preamble.',
    '- No markdown formatting — no tables, no headers, no bold, no code blocks. Plain text only.',
    '- Never output code to the user. Use the exec tool to run it yourself.',
    '- Execute tools immediately — never say "I\'ll search" or "Let me look" without calling the tool.',
    '- All tools listed above are available. Do not claim otherwise.',
    '- If a tool fails, report the error briefly. Do not speculate.',
    '- When you generate or reference a media file (image, video, audio, document), use channel_send_media to deliver it. Do not just describe the file — send it.',
    '- User messages may have contained /think or /verbose directives — these are stripped before you see the message. Do not try to parse or reference them.',
  ].join('\n');
}

/**
 * Build system & runtime section — current time, OS, host, model info
 */
function buildSystemSection(options: {
  userTimezone?: string;
  repoRoot?: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
}): string {
  const now = new Date();
  const tz = options.userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const lines = [
    '## System',
    '',
    `Date: ${now.toISOString().slice(0, 10)}`,
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

/**
 * Build identity section — delegates persona to SOUL.md
 */
function buildIdentitySection(): string {
  return [
    '## Identity',
    '',
    'You are an AI agent running on the Vargos platform.',
    'Your name, personality, and working style are defined in SOUL.md below.',
    '',
    'Respond naturally to conversation. Only use tools when the task requires them.',
    'Do NOT read workspace files or search memory on casual messages like greetings or small talk.',
  ].join('\n');
}

/**
 * Build codebase context section - prevents hallucination
 */
async function buildCodebaseContextSection(workspaceDir: string): Promise<string> {
  // Check if we're in the Vargos repo itself
  try {
    const packageJsonPath = path.join(workspaceDir, 'package.json');
    const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(packageContent);

    if (pkg.name === 'vargos') {
      return [
        '## Project Context',
        '',
        'This is the Vargos MCP server codebase.',
        '',
        'Key Components:',
        '- src/cli/ - CLI entry point, interactive menu, config/gateway actions',
        '- src/gateway/ - WebSocket gateway server, protocol, router, event bus',
        '- src/agent/ - Agent runtime, lifecycle, prompt builder, session setup',
        '- src/tools/ - Tool registry, extensions (fs, web, agent, memory)',
        '- src/sessions/ - Session storage (JSONL), types, key parsing',
        '- src/channels/ - Channel adapters (WhatsApp, Telegram)',
        '- src/cron/ - Cron scheduler, heartbeat task',
        '- src/mcp/ - MCP bridge (MCP protocol ↔ gateway RPC)',
        '- src/memory/ - Hybrid semantic + text search over workspace markdown',
        '',
        'See CLAUDE.md for full structure.',
      ].join('\n');
    }
  } catch {
    // Not the Vargos repo, return generic section
  }

  return [
    '## Project Context',
    '',
    `Working in: ${workspaceDir}`,
    '',
    'Explore the codebase structure before making assumptions.',
    'Use ls, read, and grep to understand the actual code.',
  ].join('\n');
}

/**
 * Orchestration guidance — when to delegate vs act directly
 */
function buildOrchestrationSection(sessionKey?: string): string {
  // Subagents should not orchestrate — they execute
  if (sessionKey && isSubagentSessionKey(sessionKey)) {
    return [
      '## Role: Focused Worker',
      '',
      'You are a sub-agent. Complete the assigned task directly.',
      'Do not spawn further sub-agents unless the task explicitly requires parallel work.',
      'Return a clear, concise result — your output will be synthesized by the parent agent.',
    ].join('\n');
  }

  return [
    '## Orchestration',
    '',
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
    '1. Tell the user your plan in one sentence before spawning',
    '2. Spawn one sub-agent per focused subtask — not one per micro-step',
    '3. Use `role` to set each sub-agent\'s expertise — any persona, not limited to predefined roles',
    '4. After sub-agents complete, review all results and synthesize a response',
    '5. Report what was done and what it means, not raw output',
    '',
    'Example:',
    '  sessions_spawn({ task: "Review auth module for security issues", role: "You are a security engineer. Focus on auth flows, token handling, and input validation." })',
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

/**
 * Resolve prompt mode based on session key.
 * Cron stays minimal. Subagents get a stripped-down prompt.
 */
export function resolvePromptMode(sessionKey: string): PromptMode {
  const root = sessionKey.split(':subagent:')[0];
  if (root.startsWith('cron:')) return 'minimal';
  if (isSubagentSessionKey(sessionKey)) return 'minimal-subagent';
  return 'full';
}
