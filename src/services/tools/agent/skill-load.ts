/**
 * Skill load tool — reads a full SKILL.md into agent context
 */

import { z } from 'zod';
import type { Tool } from '../types.js';
import { textResult, errorResult } from '../types.js';
import { loadSkill } from '../../../lib/skills.js';

const SkillLoadParameters = z.object({
  name: z.string().describe('Name of the skill to load (matches directory name under skills/)'),
});

export const skillLoadTool: Tool = {
  name: 'skill_load',
  description: 'Load a skill by name to get its full instructions. Use after seeing the skill in the Available Skills list.',
  parameters: SkillLoadParameters,
  formatCall: (args) => `name=${args.name}`,
  formatResult: (result) => result.isError ? 'not found' : 'loaded',
  execute: async (args: unknown, context) => {
    const { name } = SkillLoadParameters.parse(args);
    const content = await loadSkill(context.workingDir, name);
    if (!content) return errorResult(`Skill not found: ${name}`);
    return textResult(content);
  },
};
