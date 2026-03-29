import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { on, register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { getDataPaths } from '../../lib/paths.js';
import { scanSkills } from '../../lib/skills.js';
import { loadSkill } from '../../lib/skills.js';

export class WorkspaceService {
  @register('workspace.listSkills', {
    description: 'List available skills with name, description, and tags.',
    schema: z.object({}),
  })
  async listSkills(_params: EventMap['workspace.listSkills']['params']): Promise<EventMap['workspace.listSkills']['result']> {
    const { workspaceDir } = getDataPaths();
    return scanSkills(workspaceDir);
  }

  @register('workspace.loadSkill', {
    description: 'Load a skill by name to get its full instructions.',
    schema: z.object({
      name: z.string().describe('Skill name (directory name under skills/)'),
    }),
  })
  async loadSkillHandler(params: EventMap['workspace.loadSkill']['params']): Promise<EventMap['workspace.loadSkill']['result']> {
    const { workspaceDir } = getDataPaths();
    const content = await loadSkill(workspaceDir, params.name);
    if (!content) throw new Error(`Skill not found: ${params.name}`);
    return { content };
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const { workspaceDir } = getDataPaths();
  await fs.mkdir(path.join(workspaceDir, 'skills'), { recursive: true });

  bus.bootstrap(new WorkspaceService());
  return {};
}
