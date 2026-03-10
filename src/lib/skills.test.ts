import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanSkills, loadSkill } from './skills.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-skills-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createSkill(name: string, content: string): Promise<void> {
  const dir = path.join(tmpDir, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), content);
}

describe('scanSkills', () => {
  it('returns empty array when skills directory does not exist', async () => {
    expect(await scanSkills(tmpDir)).toEqual([]);
  });

  it('discovers skills with valid frontmatter', async () => {
    await createSkill('code-review', [
      '---',
      'name: code-review',
      'description: Review code for quality',
      'tags: [code, review]',
      '---',
      '# Code Review',
      'Instructions here.',
    ].join('\n'));

    const skills = await scanSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual({
      name: 'code-review',
      description: 'Review code for quality',
      tags: ['code', 'review'],
    });
  });

  it('skips skills with missing frontmatter', async () => {
    await createSkill('no-front', '# Just markdown\nNo frontmatter here.');
    expect(await scanSkills(tmpDir)).toEqual([]);
  });

  it('skips skills missing name or description', async () => {
    await createSkill('incomplete', '---\nname: incomplete\n---\n# No description');
    expect(await scanSkills(tmpDir)).toEqual([]);
  });

  it('returns skills sorted by name', async () => {
    await createSkill('zebra', '---\nname: zebra\ndescription: Z\ntags: []\n---\n');
    await createSkill('alpha', '---\nname: alpha\ndescription: A\ntags: []\n---\n');

    const skills = await scanSkills(tmpDir);
    expect(skills.map(s => s.name)).toEqual(['alpha', 'zebra']);
  });

  it('handles tags as empty array', async () => {
    await createSkill('notags', '---\nname: notags\ndescription: No tags\n---\n');
    const skills = await scanSkills(tmpDir);
    expect(skills[0].tags).toEqual([]);
  });

  it('strips quotes from values', async () => {
    await createSkill('quoted', '---\nname: "quoted"\ndescription: "A quoted description"\ntags: [a]\n---\n');
    const skills = await scanSkills(tmpDir);
    expect(skills[0].name).toBe('quoted');
    expect(skills[0].description).toBe('A quoted description');
  });
});

describe('loadSkill', () => {
  it('returns full content for existing skill', async () => {
    const content = '---\nname: test\ndescription: Test\n---\n# Test Skill\nDo things.';
    await createSkill('test', content);
    expect(await loadSkill(tmpDir, 'test')).toBe(content);
  });

  it('returns null for non-existent skill', async () => {
    expect(await loadSkill(tmpDir, 'nonexistent')).toBeNull();
  });
});
