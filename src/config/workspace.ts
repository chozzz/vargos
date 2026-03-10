/**
 * Workspace initialization utility
 * Creates default workspace structure and context files on first run
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../docs/templates');
const SKILLS_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'skills');

export const CONTEXT_FILE_NAMES = [
  'AGENTS.md', 'SOUL.md', 'TOOLS.md',
  'MEMORY.md', 'HEARTBEAT.md',
] as const;

/**
 * Load context files from a workspace directory
 * Skips missing files silently
 */
export async function loadContextFiles(
  workspaceDir: string,
): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = [];
  for (const name of CONTEXT_FILE_NAMES) {
    try {
      const content = await fs.readFile(path.join(workspaceDir, name), 'utf-8');
      files.push({ name, content });
    } catch { /* skip missing */ }
  }
  return files;
}

/**
 * Read a template file from docs/templates/
 * Returns empty string if template is missing
 */
async function readTemplate(name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(TEMPLATES_DIR, name), 'utf-8');
  } catch {
    return '';
  }
}

interface WorkspaceInitOptions {
  workspaceDir: string;
  skipIfExists?: boolean;
}

/**
 * Copy default skill templates into workspace skills directory.
 * Only copies skills that don't already exist (never overwrites user skills).
 */
async function copySkillTemplates(workspaceDir: string): Promise<void> {
  const skillsDir = path.join(workspaceDir, 'skills');

  let templateEntries: string[];
  try {
    templateEntries = await fs.readdir(SKILLS_TEMPLATES_DIR);
  } catch {
    return; // no skill templates bundled
  }

  for (const name of templateEntries) {
    const destDir = path.join(skillsDir, name);
    const destFile = path.join(destDir, 'SKILL.md');

    // Never overwrite existing skills
    try {
      await fs.access(destFile);
      continue;
    } catch { /* doesn't exist, copy it */ }

    const srcFile = path.join(SKILLS_TEMPLATES_DIR, name, 'SKILL.md');
    try {
      const content = await fs.readFile(srcFile, 'utf-8');
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(destFile, content, 'utf-8');
    } catch { /* skip broken templates */ }
  }
}

/**
 * Initialize workspace with default structure and files
 * Copies templates from docs/templates/ into the workspace directory
 */
export async function initializeWorkspace(options: WorkspaceInitOptions): Promise<void> {
  const { workspaceDir, skipIfExists = true } = options;

  await fs.mkdir(path.join(workspaceDir, 'memory'), { recursive: true });

  for (const name of CONTEXT_FILE_NAMES) {
    const filePath = path.join(workspaceDir, name);

    if (skipIfExists) {
      try {
        await fs.access(filePath);
        continue;
      } catch { /* doesn't exist, create it */ }
    }

    const content = await readTemplate(name);
    if (content) await fs.writeFile(filePath, content, 'utf-8');
  }

  await copySkillTemplates(workspaceDir);
}

/**
 * Check if workspace is initialized
 */
export async function isWorkspaceInitialized(workspaceDir: string): Promise<boolean> {
  try {
    const files = ['AGENTS.md', 'TOOLS.md'];
    for (const file of files) {
      await fs.access(path.join(workspaceDir, file));
    }
    return true;
  } catch {
    return false;
  }
}
