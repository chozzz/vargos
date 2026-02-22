/**
 * System prompt builder for Vargos
 * System prompt assembly with bootstrap file injection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSubagentSessionKey } from '../lib/errors.js';
import { toolRegistry } from '../tools/registry.js';

export interface SystemPromptOptions {
  mode: 'full' | 'minimal' | 'none';
  workspaceDir: string;
  toolNames: string[];
  contextFiles?: Array<{ name: string; content: string }>;
  extraSystemPrompt?: string;
  userTimezone?: string;
  repoRoot?: string;
  model?: string;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  channel?: string;
  bootstrapOverrides?: Record<string, string>;
}

// Bootstrap files to inject (in priority order)
const BOOTSTRAP_FILES = [
  'ARCHITECTURE.md', // Project structure and overview
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
  'HEARTBEAT.md',
  'MEMORY.md',     // Project context and curated memories
  'BOOTSTRAP.md',  // Only on first run
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

  // 0. Identity - Who this assistant is
  sections.push(buildIdentitySection());

  // 1. Tooling section
  sections.push(await buildToolingSection(toolNames));

  // 2. Workspace section
  sections.push(buildWorkspaceSection(workspaceDir));

  // 2.5 Codebase context - what this project is (prevents hallucination)
  if (mode === 'full') {
    sections.push(await buildCodebaseContextSection(workspaceDir));
  }

  // 3. Memory recall guidance (full mode only)
  if (mode === 'full') {
    sections.push(buildMemorySection());
  }

  // 3.5 Heartbeat protocol
  if (mode === 'full') {
    sections.push(buildHeartbeatSection());
  }

  // 4. Project Context - Injected bootstrap files
  const bootstrapContent = await loadBootstrapFiles(workspaceDir, mode, options.bootstrapOverrides);
  if (bootstrapContent) {
    sections.push(bootstrapContent);
  }

  // 4.5 Behavioral override — placed after bootstrap so it takes precedence
  if (mode === 'full') {
    sections.push(buildBehaviorSection());
  }

  // 4.7 Tool narration guidance
  if (mode === 'full') {
    sections.push(buildToolNarrationSection());
  }

  // 5. Channel context (if from a messaging channel)
  if (options.channel) {
    sections.push(buildChannelSection(options.channel));
  }

  // 6. Current Date & Time
  if (userTimezone) {
    sections.push(buildTimeSection(userTimezone));
  }

  // 7. Runtime info
  sections.push(buildRuntimeSection(repoRoot, model, thinking));

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
  // Core tool descriptions
  const coreToolDescriptions: Record<string, string> = {
    read: 'Read file contents',
    write: 'Create or overwrite files',
    edit: 'Make precise edits to files by replacing exact text',
    exec: 'Execute shell commands (git, gh, npm, curl, etc.). Use for cloning repos, running builds, managing git workflows',
    process: 'Manage long-running background exec sessions (start, poll, log, kill)',
    browser: 'Control web browser for automation (navigate, click, screenshot)',
    'web_fetch': 'Fetch and extract readable content from URLs',
    'memory_search': 'Search indexed memory files with hybrid vector+text',
    'memory_get': 'Get specific lines from memory files',
    'sessions_list': 'List sessions with filters',
    'sessions_history': 'Fetch message history for a session',
    'sessions_send': 'Send message to another session',
    'sessions_spawn': 'Spawn a sub-agent in isolated session',
    'cron_add': 'Schedule recurring tasks',
    'cron_list': 'List scheduled cron jobs',
  };

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
    const desc = coreToolDescriptions[name] || toolRegistry.get(name)?.description || 'Available tool';
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
    'If a task is more complex or takes longer, spawn a sub-agent with sessions_spawn.',
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
 * Behavioral override — placed after bootstrap files so it takes precedence
 * over any "read files before doing anything" instructions in AGENTS.md
 */
function buildBehaviorSection(): string {
  return [
    '## Behavior',
    '',
    'IMPORTANT: The workspace rules above (AGENTS.md) apply when executing tasks.',
    'For casual conversation (greetings, small talk, questions about yourself),',
    'respond directly and naturally WITHOUT reading files or searching memory first.',
    'Only use tools when the user\'s message requires action or information retrieval.',
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

// Subagents only need these files to save tokens
const SUBAGENT_ALLOWLIST = new Set(['AGENTS.md', 'TOOLS.md']);

/**
 * Load and inject bootstrap files.
 * Uses 70/20 head/tail truncation to preserve both beginning and end of large files.
 */
async function loadBootstrapFiles(
  workspaceDir: string,
  mode: 'full' | 'minimal',
  overrides?: Record<string, string>,
): Promise<string | null> {
  const lines: string[] = [];
  const isFirstRun = await checkFirstRun(workspaceDir);
  let hasSoulFile = false;

  for (const filename of BOOTSTRAP_FILES) {
    if (filename === 'BOOTSTRAP.md' && !isFirstRun) continue;
    if (mode === 'minimal' && !SUBAGENT_ALLOWLIST.has(filename)) continue;

    let content: string;

    if (overrides?.[filename] !== undefined) {
      content = overrides[filename];
    } else {
      const filepath = path.join(workspaceDir, filename);
      try {
        content = await fs.readFile(filepath, 'utf-8');
      } catch {
        if (mode === 'full') {
          lines.push(`<!-- ${filename} - missing -->`);
        }
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

  // SOUL.md persona hint
  if (hasSoulFile) {
    lines.push('If SOUL.md is present, embody its persona. Avoid stiff, generic replies.');
    lines.push('');
  }

  if (lines.length === 0) return null;

  const label = mode === 'minimal' ? 'Subagent Context' : 'Project Context';
  return [`## ${label}`, '', ...lines].join('\n');
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
    '- Execute tools immediately — never say "I\'ll search" or "Let me look" without actually calling the tool in the same response.',
    '- All tools listed in ## Tooling above are available and working. Do not claim otherwise.',
    '- Keep responses concise. No markdown tables — use plain text lists.',
    '- If a tool call fails, report the error. Do not speculate about missing connections or configuration.',
  ].join('\n');
}

/**
 * Build time section
 */
function buildTimeSection(timezone: string): string {
  return [
    '## Current Date & Time',
    '',
    `Timezone: ${timezone}`,
    '',
    `Use session_status when you need the current time; the status card includes a timestamp line.`,
  ].join('\n');
}

/**
 * Build runtime section
 */
function buildRuntimeSection(
  repoRoot?: string,
  model?: string,
  thinking?: 'off' | 'low' | 'medium' | 'high'
): string {
  const info: string[] = [];

  if (repoRoot) {
    info.push(`repo=${repoRoot}`);
  }
  if (model) {
    info.push(`model=${model}`);
  }
  if (thinking && thinking !== 'off') {
    info.push(`thinking=${thinking}`);
  }

  const infoStr = info.length > 0 ? ` (${info.join(', ')})` : '';

  return [
    '## Runtime',
    '',
    `host=vargos${infoStr}`,
  ].join('\n');
}

/**
 * Build identity section - who this assistant is
 */
function buildIdentitySection(): string {
  return [
    '## Identity',
    '',
    'You are Vargos, an Artificially Intelligent Agentic Assistant.',
    'You help users by providing powerful tools for file manipulation, shell execution, browser automation, and agent management.',
    '',
    'Respond naturally to conversation. Only use tools when the user asks you to do something that requires them.',
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
        '- src/services/ - Gateway services (agent, tools, sessions, channels, cron)',
        '- src/mcp/ - MCP bridge (MCP protocol ↔ gateway RPC)',
        '- src/runtime/ - Agent runtime, lifecycle, message queue, prompt builder',
        '- src/extensions/ - Built-in tools, channel adapters, file services',
        '',
        'See CLAUDE.md and ARCHITECTURE.md for full structure.',
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
 * Check if this is first run (BOOTSTRAP.md exists but no other files)
 */
async function checkFirstRun(workspaceDir: string): Promise<boolean> {
  try {
    // Check if BOOTSTRAP.md exists
    await fs.access(path.join(workspaceDir, 'BOOTSTRAP.md'));

    // Check if any other bootstrap files exist
    for (const file of BOOTSTRAP_FILES) {
      if (file === 'BOOTSTRAP.md') continue;
      try {
        await fs.access(path.join(workspaceDir, file));
        return false; // Other files exist, not first run
      } catch {
        // Continue checking
      }
    }

    return true; // Only BOOTSTRAP.md exists
  } catch {
    return false; // BOOTSTRAP.md doesn't exist
  }
}

/**
 * Resolve prompt mode based on session key
 */
export function resolvePromptMode(sessionKey: string): 'full' | 'minimal' | 'none' {
  // Subagents get minimal prompt
  if (isSubagentSessionKey(sessionKey)) {
    return 'minimal';
  }
  // Cron jobs get minimal
  if (sessionKey.startsWith('cron:')) {
    return 'minimal';
  }
  // Main sessions get full prompt
  return 'full';
}

// Re-export for backward compatibility
export { isSubagentSessionKey } from '../lib/errors.js';
