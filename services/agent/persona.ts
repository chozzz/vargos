import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from '../../lib/frontmatter.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('agent-persona');

/** Pi SDK built-in tool names — used as the default availability set when expanding globs. */
export const PI_BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const;

export interface ChannelPersona {
  allowedToolNames?: string[];
  initialActiveToolNames?: string[];
  body?: string;
}

/**
 * Load persona for `channelId` from `~/.vargos/agents/<channelId>.md`. Re-reads from disk on
 * every call (no in-memory cache). Returns null if the file is missing or has no overrides.
 */
export async function loadChannelPersona(
  channelId: string,
  availableTools: string[],
): Promise<ChannelPersona | null> {
  const file = path.join(getDataPaths().dataDir, 'agents', `${channelId}.md`);
  if (!existsSync(file)) return null;

  const content = await fs.readFile(file, 'utf-8');
  const parsed = parseFrontmatter(content);

  if (!parsed) {
    if (!content.trim()) {
      log.warn(`agents/${channelId}.md is empty — not loaded`);
      return null;
    }
    return { body: content.trim() };
  }

  const meta = parsed.meta;
  const body = parsed.body.trim();

  const allowedPatterns = Array.isArray(meta.allowedTools)
    ? (meta.allowedTools as unknown[]).map(String)
    : undefined;
  const initialActiveToolNames = Array.isArray(meta.initialActiveTools)
    ? (meta.initialActiveTools as unknown[]).map(String)
    : undefined;

  const hasAllowed = allowedPatterns && allowedPatterns.length > 0;
  const hasInitial = initialActiveToolNames && initialActiveToolNames.length > 0;
  const hasBody = body.length > 0;

  if (!hasAllowed && !hasInitial && !hasBody) {
    log.warn(`agents/${channelId}.md has no overrides — not loaded`);
    return null;
  }

  return {
    allowedToolNames: hasAllowed ? expandToolGlobs(allowedPatterns!, availableTools) : undefined,
    initialActiveToolNames: hasInitial ? initialActiveToolNames : undefined,
    body: hasBody ? body : undefined,
  };
}

/**
 * Expand glob patterns (only `*` wildcard) against a list of available tool names.
 * `"memory.*"` matches `memory.search`, `memory.read`, etc. `"*"` matches everything.
 * Patterns without `*` must match exactly.
 */
export function expandToolGlobs(patterns: string[], availableTools: string[]): string[] {
  const matched = new Set<string>();
  for (const p of patterns) {
    if (!p.includes('*')) {
      if (availableTools.includes(p)) matched.add(p);
      continue;
    }
    const parts = p.split('*').map(escapeRegex);
    const re = new RegExp('^' + parts.join('.*') + '$');
    for (const tool of availableTools) if (re.test(tool)) matched.add(tool);
  }
  return Array.from(matched);
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ensure a persona file exists for each channel id. Copies `default.md` to
 * `~/.vargos/agents/<id>.md` if missing. Idempotent — runs at every startup.
 */
export async function ensureChannelPersonaFiles(channelIds: string[]): Promise<void> {
  const agentsDir = path.join(getDataPaths().dataDir, 'agents');
  const defaultFile = path.join(agentsDir, 'default.md');
  if (!existsSync(defaultFile)) {
    log.warn(`${defaultFile} missing — startup template seed should have copied it`);
    return;
  }
  await fs.mkdir(agentsDir, { recursive: true });
  for (const id of channelIds) {
    const file = path.join(agentsDir, `${id}.md`);
    if (existsSync(file)) continue;
    await fs.copyFile(defaultFile, file);
    log.info(`seeded agent persona file: ${file}`);
  }
}
