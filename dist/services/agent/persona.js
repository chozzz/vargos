import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from '../../lib/frontmatter.js';
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';
const log = createLogger('agent-persona');
/**
 * Load persona for `channelId` from `~/.vargos/agents/<channelId>.md`. Re-reads from disk on
 * every call (no in-memory cache). Returns null when the file is missing, totally empty,
 * or has neither frontmatter nor body content.
 */
export async function loadChannelPersona(channelId) {
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
    const parsed = parseFrontmatter(content);
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
 * Load the subagent persona from `~/.vargos/agents/subagent.md`.
 * Seeded from `.templates/agents/subagent.md` on startup (copy-missing).
 * Returns null if the file is missing or empty.
 */
export async function loadSubagentPersona() {
    const file = path.join(getDataPaths().dataDir, 'agents', 'subagent.md');
    if (!existsSync(file)) {
        log.warn('agents/subagent.md not found — subagent running without preamble or tool restrictions');
        return null;
    }
    const content = await fs.readFile(file, 'utf-8');
    if (!content.trim())
        return null;
    const parsed = parseFrontmatter(content);
    if (!parsed)
        return { meta: {}, body: content.trim() };
    return { meta: parsed.meta, body: parsed.body.trim() };
}
/**
 * Ensure a persona file exists for each channel id. Copies `default.md` to
 * `~/.vargos/agents/<id>.md` if missing. Idempotent — runs at every startup.
 */
async function ensureChannelPersonaFiles(channelIds) {
    const agentsDir = path.join(getDataPaths().dataDir, 'agents');
    const defaultFile = path.join(agentsDir, 'default.md');
    if (!existsSync(defaultFile)) {
        log.warn(`${defaultFile} missing — startup template seed should have copied it`);
        return [];
    }
    await fs.mkdir(agentsDir, { recursive: true });
    const files = [];
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
//# sourceMappingURL=persona.js.map