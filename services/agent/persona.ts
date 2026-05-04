import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from '../../lib/frontmatter.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('agent-persona');

export interface PersonaMeta {
  /** Glob whitelist of customTools the channel agent can call. Empty/missing = all customTools allowed. */
  allowedTools?: string[];
}

export interface Persona {
  meta: PersonaMeta;
  body: string;
}

/**
 * Load persona for `channelId` from `~/.vargos/agents/<channelId>.md`. Re-reads from disk on
 * every call (no in-memory cache). Returns null when the file is missing, totally empty,
 * or has neither frontmatter nor body content.
 */
export async function loadChannelPersona(channelId: string): Promise<Persona | null> {
  const files = await ensureChannelPersonaFiles([channelId]);

  if (files.length === 0) {
    log.warn(`agents/${channelId}.md is missing — not loaded`);
    return null;
  }

  const file = files?.[0];

  if (!file || !existsSync(file)) {
    log.warn(`agents/${channelId}.md exists but is not readable — not loaded`);
    return null;
  }

  const content = await fs.readFile(file, 'utf-8');
  
  if (!content || !content.trim()) {
    log.warn(`agents/${channelId}.md is empty — not loaded`);
    return null;
  }

  const parsed = parseFrontmatter<PersonaMeta>(content);
  if (!parsed) {
    return { meta: {}, body: content.trim() };
  }

  const body = parsed.body.trim();
  const hasAllowedTools = Array.isArray(parsed.meta.allowedTools) && parsed.meta.allowedTools.length > 0;
  if (!body && !hasAllowedTools) {
    log.warn(`agents/${channelId}.md has no overrides — not loaded`);
    return null;
  }

  return { meta: parsed.meta, body };
}

/**
 * Ensure a persona file exists for each channel id. Copies `default.md` to
 * `~/.vargos/agents/<id>.md` if missing. Idempotent — runs at every startup.
 */
async function ensureChannelPersonaFiles(channelIds: string[]): Promise<string[]> {
  const agentsDir = path.join(getDataPaths().dataDir, 'agents');
  const defaultFile = path.join(agentsDir, 'default.md');
  if (!existsSync(defaultFile)) {
    log.warn(`${defaultFile} missing — startup template seed should have copied it`);
    return [];
  }
  await fs.mkdir(agentsDir, { recursive: true });
  const files: string[] = [];
  for (const id of channelIds) {
    const file = path.join(agentsDir, `${id}.md`);
    if (!existsSync(file)) {
      await fs.copyFile(defaultFile, file);
      log.info(`seeded agent persona file: ${file}`);
    }
    files.push(file);
  }
  return files;
}
