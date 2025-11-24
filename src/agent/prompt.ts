/**
 * System prompt builder for Vargos
 * OpenClaw-style prompt assembly with bootstrap file injection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

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
}

// Bootstrap files to inject (in priority order)
const BOOTSTRAP_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md', // Only on first run
];

const DEFAULT_BOOTSTRAP_MAX_CHARS = 20000;

/**
 * Build system prompt like OpenClaw
 */
export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  const { mode, workspaceDir, toolNames, userTimezone, repoRoot, model, thinking } = options;

  if (mode === 'none') {
    return 'You are a helpful assistant.';
  }

  const sections: string[] = [];

  // 1. Tooling section
  sections.push(await buildToolingSection(toolNames));

  // 2. Workspace section
  sections.push(buildWorkspaceSection(workspaceDir));

  // 3. Documentation section (for full mode)
  if (mode === 'full') {
    sections.push(buildDocumentationSection());
  }

  // 4. Project Context - Injected bootstrap files
  const bootstrapContent = await loadBootstrapFiles(workspaceDir, mode);
  if (bootstrapContent) {
    sections.push(bootstrapContent);
  }

  // 5. Current Date & Time
  if (userTimezone) {
    sections.push(buildTimeSection(userTimezone));
  }

  // 6. Runtime info
  sections.push(buildRuntimeSection(repoRoot, model, thinking));

  // 7. Extra prompt if provided
  if (options.extraSystemPrompt) {
    sections.push(`## Additional Context\n\n${options.extraSystemPrompt}`);
  }

  // Join all sections
  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build tooling section
 */
async function buildToolingSection(toolNames: string[]): Promise<string> {
  const lines = [
    '## Tooling',
    '',
    'Available tools:',
    ...toolNames.map(name => `- ${name}`),
    '',
    'Use tools naturally to complete tasks. When using tools, wait for results before proceeding.',
  ];

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
    'Read AGENTS.md for workspace rules and TOOLS.md for local tool notes before starting work.',
  ].join('\n');
}

/**
 * Build documentation section
 */
function buildDocumentationSection(): string {
  return [
    '## Documentation',
    '',
    'Vargos docs: /usr/lib/node_modules/openclaw/docs (or https://docs.openclaw.ai)',
    'Source: https://github.com/openclaw/openclaw',
    'Skills: https://clawhub.com',
    '',
    'Consult local docs first for OpenClaw behavior, commands, configuration, or architecture.',
  ].join('\n');
}

/**
 * Load and inject bootstrap files
 */
async function loadBootstrapFiles(workspaceDir: string, mode: 'full' | 'minimal'): Promise<string | null> {
  const lines: string[] = [];
  const isFirstRun = await checkFirstRun(workspaceDir);

  for (const filename of BOOTSTRAP_FILES) {
    // Skip BOOTSTRAP.md unless first run
    if (filename === 'BOOTSTRAP.md' && !isFirstRun) {
      continue;
    }

    const filepath = path.join(workspaceDir, filename);
    let content: string;

    try {
      content = await fs.readFile(filepath, 'utf-8');
    } catch {
      // File doesn't exist - inject missing marker
      if (mode === 'full') {
        lines.push(`<!-- ${filename} - missing -->`);
      }
      continue;
    }

    // Skip empty files
    if (!content.trim()) {
      continue;
    }

    // Truncate large files
    const maxChars = DEFAULT_BOOTSTRAP_MAX_CHARS;
    let displayContent = content;
    let truncated = false;

    if (content.length > maxChars) {
      displayContent = content.slice(0, maxChars);
      truncated = true;
    }

    // Add file content with header
    lines.push(`<!-- ${filename} -->`);
    lines.push(displayContent);
    if (truncated) {
      lines.push(`\n<!-- ... truncated (${content.length - maxChars} more chars) -->`);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    return null;
  }

  const label = mode === 'minimal' ? 'Subagent Context' : 'Project Context';

  return [
    `## ${label}`,
    '',
    ...lines,
  ].join('\n');
}

/**
 * Build time section
 */
function buildTimeSection(timezone: string): string {
  const now = new Date();
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

/**
 * Check if session key is a subagent
 */
export function isSubagentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:') || 
         sessionKey.startsWith('agent:') ||
         sessionKey.includes('subagent');
}
