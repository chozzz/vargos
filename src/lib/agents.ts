/**
 * Agent definitions scanner
 * Agents are lightweight routing aliases — name, description, skills[], model.
 * Skill content is the source of truth; agents just bundle them.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export interface AgentManifestEntry {
  name: string;
  description: string;
  model?: string;
  skills: string[];
}

/**
 * Scan agents directory for definition files.
 * Returns lightweight manifest entries for system prompt injection.
 */
export async function scanAgents(workspaceDir: string): Promise<AgentManifestEntry[]> {
  const agentsDir = path.join(workspaceDir, 'agents');

  let entries: string[];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return [];
  }

  const agents: AgentManifestEntry[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    try {
      const content = await fs.readFile(path.join(agentsDir, entry), 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed?.meta?.name || !parsed?.meta?.description) continue;

      agents.push({
        name: String(parsed.meta.name),
        description: String(parsed.meta.description),
        model: parsed.meta.model ? String(parsed.meta.model) : undefined,
        skills: Array.isArray(parsed.meta.skills) ? parsed.meta.skills.map(String) : [],
      });
    } catch {
      continue;
    }
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/** Load a single agent definition by name. Returns null if not found. */
export async function loadAgent(workspaceDir: string, name: string): Promise<AgentManifestEntry | null> {
  const filePath = path.join(workspaceDir, 'agents', `${name}.md`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);
    if (!parsed?.meta?.name) return null;

    return {
      name: String(parsed.meta.name),
      description: String(parsed.meta.description ?? ''),
      model: parsed.meta.model ? String(parsed.meta.model) : undefined,
      skills: Array.isArray(parsed.meta.skills) ? parsed.meta.skills.map(String) : [],
    };
  } catch {
    return null;
  }
}
