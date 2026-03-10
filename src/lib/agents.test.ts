import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanAgents, loadAgent } from './agents.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-agents-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createAgent(name: string, content: string): Promise<void> {
  const dir = path.join(tmpDir, 'agents');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.md`), content);
}

describe('scanAgents', () => {
  it('returns empty array when agents directory does not exist', async () => {
    expect(await scanAgents(tmpDir)).toEqual([]);
  });

  it('discovers agents with valid frontmatter', async () => {
    await createAgent('code-reviewer', [
      '---',
      'name: code-reviewer',
      'description: Reviews code for quality and patterns',
      'skills: [code-review]',
      '---',
      '# Code Reviewer',
      'You review code.',
    ].join('\n'));

    const agents = await scanAgents(tmpDir);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toEqual({
      name: 'code-reviewer',
      description: 'Reviews code for quality and patterns',
      model: undefined,
      skills: ['code-review'],
    });
  });

  it('skips non-md files', async () => {
    const dir = path.join(tmpDir, 'agents');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not an agent');
    expect(await scanAgents(tmpDir)).toEqual([]);
  });

  it('includes model when specified', async () => {
    await createAgent('researcher', [
      '---',
      'name: researcher',
      'description: Deep research agent',
      'model: claude-sonnet',
      'skills: []',
      '---',
      'You do research.',
    ].join('\n'));

    const agents = await scanAgents(tmpDir);
    expect(agents[0].model).toBe('claude-sonnet');
  });

  it('returns agents sorted by name', async () => {
    await createAgent('zebra', '---\nname: zebra\ndescription: Z\n---\n');
    await createAgent('alpha', '---\nname: alpha\ndescription: A\n---\n');
    const agents = await scanAgents(tmpDir);
    expect(agents.map(a => a.name)).toEqual(['alpha', 'zebra']);
  });
});

describe('loadAgent', () => {
  it('returns manifest entry for existing agent', async () => {
    await createAgent('test', '---\nname: test\ndescription: Test agent\nskills: [code-review]\n---\n');
    const agent = await loadAgent(tmpDir, 'test');
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('test');
    expect(agent!.skills).toEqual(['code-review']);
    expect(agent).not.toHaveProperty('body');
  });

  it('returns null for non-existent agent', async () => {
    expect(await loadAgent(tmpDir, 'nonexistent')).toBeNull();
  });
});
