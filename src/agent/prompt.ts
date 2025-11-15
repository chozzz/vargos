/**
 * System prompt builder for Pi agents
 * Supports minimal mode for subagents (like OpenClaw)
 */

export type PromptMode = 'full' | 'minimal' | 'none';

export interface SystemPromptParams {
  mode: PromptMode;
  workspaceDir: string;
  toolNames: string[];
  toolSummaries?: Record<string, string>;
  docsPath?: string;
  userTimezone?: string;
  extraSystemPrompt?: string;
  contextFiles?: Array<{ name: string; content: string }>;
}

// Subagents only get these context files (like OpenClaw)
const SUBAGENT_CONTEXT_ALLOWLIST = new Set(['AGENTS.md', 'TOOLS.md']);

export function buildSystemPrompt(params: SystemPromptParams): string {
  if (params.mode === 'none') {
    return 'You are a personal assistant.';
  }

  const isMinimal = params.mode === 'minimal';
  const lines: string[] = [
    'You are a personal assistant running inside Vargos.',
    '',
    '## Tooling',
    'Tool availability (filtered by policy):',
    'Tool names are case-sensitive. Call tools exactly as listed.',
    ...params.toolNames.map((name) => `- ${name}`),
    '',
    '## Tool Call Style',
    'Default: do not narrate routine, low-risk tool calls (just call the tool).',
    'Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions.',
    'Keep narration brief and value-dense; avoid repeating obvious steps.',
    '',
  ];

  // Skills section (full mode only)
  if (!isMinimal) {
    lines.push(
      '## Skills (mandatory)',
      'Before replying: scan <available_skills> <description> entries.',
      '- If exactly one skill clearly applies: read its SKILL.md, then follow it.',
      '- If multiple could apply: choose the most specific one, then read/follow it.',
      '- If none clearly apply: do not read any skill up front.',
      ''
    );
  }

  // Memory section (full mode only)
  if (!isMinimal && params.toolNames.some(t => t.includes('memory'))) {
    lines.push(
      '## Memory Recall',
      'Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md.',
      ''
    );
  }

  // Workspace
  lines.push(
    '## Workspace',
    `Your working directory is: ${params.workspaceDir}`,
    'Treat this directory as the single global workspace for file operations.',
    ''
  );

  // Documentation (full mode only)
  if (!isMinimal && params.docsPath) {
    lines.push(
      '## Documentation',
      `Vargos docs: ${params.docsPath}`,
      ''
    );
  }

  // Time (always included)
  if (params.userTimezone) {
    lines.push(
      '## Current Date & Time',
      `Time zone: ${params.userTimezone}`,
      ''
    );
  }

  // Context files injection
  if (params.contextFiles && params.contextFiles.length > 0) {
    const filteredFiles = isMinimal
      ? params.contextFiles.filter((f) => SUBAGENT_CONTEXT_ALLOWLIST.has(f.name))
      : params.contextFiles;

    if (filteredFiles.length > 0) {
      lines.push(
        '## Workspace Files (injected)',
        'These user-editable files are loaded by Vargos and included below in Project Context.',
        ''
      );

      for (const file of filteredFiles) {
        lines.push(
          `## ${file.name}`,
          file.content,
          ''
        );
      }
    }
  }

  // Silent replies
  lines.push(
    '## Silent Replies',
    'When you have nothing to say, respond with ONLY: NO_REPLY',
    '⚠️ Rules:',
    '- It must be your ENTIRE message — nothing else',
    '- Never append it to an actual response',
    ''
  );

  // Extra context (for subagents this becomes "Subagent Context")
  if (params.extraSystemPrompt) {
    const header = isMinimal ? '## Subagent Context' : '## Group Chat Context';
    lines.push(header, params.extraSystemPrompt, '');
  }

  return lines.join('\n');
}

/**
 * Filter context files for subagent sessions
 * Like OpenClaw's SUBAGENT_BOOTSTRAP_ALLOWLIST
 */
export function filterContextFilesForSubagent(
  files: Array<{ name: string; content: string }>
): Array<{ name: string; content: string }> {
  return files.filter((f) => SUBAGENT_CONTEXT_ALLOWLIST.has(f.name));
}

import { isSubagentSessionKey as _isSubagentSessionKey } from '../utils/errors.js';

// Re-export from utils for backward compatibility
export const isSubagentSessionKey = _isSubagentSessionKey;

/**
 * Resolve prompt mode based on session key
 */
export function resolvePromptMode(sessionKey: string): PromptMode {
  return isSubagentSessionKey(sessionKey) ? 'minimal' : 'full';
}
