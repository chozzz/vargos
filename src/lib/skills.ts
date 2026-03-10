/**
 * Skills directory scanner
 * Reads SKILL.md files from ~/.vargos/workspace/skills/ for discovery and loading.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export interface SkillManifestEntry {
  name: string;
  description: string;
  tags: string[];
}

/**
 * Scan skills directory for SKILL.md files.
 * Returns name + description only (lightweight manifest for system prompt).
 */
export async function scanSkills(workspaceDir: string): Promise<SkillManifestEntry[]> {
  const skillsDir = path.join(workspaceDir, 'skills');

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return [];
  }

  const skills: SkillManifestEntry[] = [];

  for (const entry of entries) {
    const skillFile = path.join(skillsDir, entry, 'SKILL.md');
    try {
      const content = await fs.readFile(skillFile, 'utf-8');
      const parsed = parseFrontmatter(content);
      if (!parsed?.meta?.name || !parsed?.meta?.description) continue;

      skills.push({
        name: String(parsed.meta.name),
        description: String(parsed.meta.description),
        tags: Array.isArray(parsed.meta.tags) ? parsed.meta.tags.map(String) : [],
      });
    } catch {
      continue;
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Load the full content of a skill by name. Returns null if not found. */
export async function loadSkill(workspaceDir: string, name: string): Promise<string | null> {
  const skillFile = path.join(workspaceDir, 'skills', name, 'SKILL.md');
  try {
    return await fs.readFile(skillFile, 'utf-8');
  } catch {
    return null;
  }
}
