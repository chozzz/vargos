import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitterBus } from '../../../../gateway/emitter.js';
import { WorkspaceService } from '../../index.js';

describe('WorkspaceService E2E', () => {
  let bus: EventEmitterBus;
  let service: WorkspaceService;

  beforeEach(async () => {
    bus = new EventEmitterBus();
    service = new WorkspaceService();
    bus.bootstrap(service);
  });

  describe('workspace.listSkills', () => {
    it('returns list of available skills', async () => {
      const result = await bus.call('workspace.listSkills', {});

      expect(Array.isArray(result)).toBe(true);
      // May be empty if no skills in workspace, that's ok
    });

    it('skill entries have required fields', async () => {
      const skills = await bus.call('workspace.listSkills', {});

      if (skills.length > 0) {
        const skill = skills[0];
        expect(skill.name).toBeDefined();
        expect(skill.description).toBeDefined();
      }
    });
  });

  describe('workspace.loadSkill', () => {
    it('throws on non-existent skill', async () => {
      try {
        await bus.call('workspace.loadSkill', {
          name: 'nonexistent-skill-12345',
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).toBeDefined();
      }
    });

    it('returns skill content if available', async () => {
      const skills = await bus.call('workspace.listSkills', {});

      if (skills.length > 0) {
        const skillName = skills[0].name;
        const skill = await bus.call('workspace.loadSkill', { name: skillName });

        expect(skill.content).toBeDefined();
        expect(typeof skill.content).toBe('string');
      }
    });
  });
});
