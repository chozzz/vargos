import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { loadSubagentPersona } from '../persona.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus, MethodInfo } from '../../../core/types.js';
import { resetDataPaths } from '../../../lib/paths.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

class TestableRuntime extends AgentService {
  testGetSystemPrompt(sessionKey: string, personaBody?: string) {
    return this['getSystemPrompt'](sessionKey, personaBody);
  }
  testLoadPersonaIfChannel(sessionKey: string) {
    return this['loadPersonaIfChannel'](sessionKey);
  }
  testGetCustomTools(sessionKey: string, allowedPatterns?: string[]) {
    return this.getCustomTools(sessionKey, allowedPatterns);
  }
}

/** Build registry entries (what `bus.list()` returns) that become agent tools. */
function toolMethods(events: string[]): MethodInfo[] {
  return events.map(name => ({
    name,
    service: name.split('.')[0],
    description: `Tool: ${name}`,
    internal: false,
    live: false,
    schema: {},
  }));
}

async function createTestRuntime(
  dataDir: string,
  tools: MethodInfo[] = [],
  channels?: Array<{ id: string; type: string; botToken?: string }>,
): Promise<TestableRuntime> {
  const config = AppConfigSchema.parse({
    providers: {
      test: { baseUrl: 'http://localhost:1234', apiKey: 'test-key', api: 'openai-completions', models: [{ id: 'test-model', name: 'Test Model' }] },
    },
    agent: { model: 'test:test-model' },
    ...(channels && { channels }),
  });

  process.env.VARGOS_DATA_DIR = dataDir;
  resetDataPaths();

  const mockBus = {
    call: async (event: string) => (event === 'config.get' ? config : {}),
    register: () => () => {},
    on: () => () => {},
    emit: () => {},
    has: () => false,
    list: () => tools,
  } as unknown as Bus;

  const runtime = new TestableRuntime();
  await runtime.init(mockBus);
  return runtime;
}

// ── loadSubagentPersona ──────────────────────────────────────────────────────

describe('loadSubagentPersona', () => {
  let tmpDir: string;
  let agentsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `subagent-persona-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when subagent.md does not exist', async () => {
    expect(await loadSubagentPersona()).toBeNull();
  });

  it('returns null for empty file', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '');
    expect(await loadSubagentPersona()).toBeNull();
  });

  it('returns null for whitespace-only file', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '   \n\n  ');
    expect(await loadSubagentPersona()).toBeNull();
  });

  it('parses frontmatter allowedTools and body', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '---\nallowedTools:\n  - memory.*\n  - media.*\n---\n\nYou are a subagent.\n');
    const result = await loadSubagentPersona();
    expect(result).not.toBeNull();
    expect(result!.meta.allowedTools).toEqual(['memory.*', 'media.*']);
    expect(result!.body).toBe('You are a subagent.');
  });

  it('returns body when no frontmatter', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), 'Just a preamble, no frontmatter.\n');
    const result = await loadSubagentPersona();
    expect(result).not.toBeNull();
    expect(result!.meta).toEqual({});
    expect(result!.body).toBe('Just a preamble, no frontmatter.');
  });

  it('returns allowedTools with empty body', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '---\nallowedTools:\n  - memory.search\n---\n');
    const result = await loadSubagentPersona();
    expect(result).not.toBeNull();
    expect(result!.meta.allowedTools).toEqual(['memory.search']);
    expect(result!.body).toBe('');
  });
});

// ── Subagent system prompt routing ───────────────────────────────────────────

describe('subagent system prompt routing', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `subagent-prompt-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    workspaceDir = path.join(tmpDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('subagent session skips bootstrap files and returns personaBody', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), 'WORKSPACE_CONTENT_SHOULD_NOT_APPEAR');
    const runtime = await createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('telegram:user123:subagent:abc12345', 'You are a subagent.');
    expect(prompt).toBe('You are a subagent.');
  });

  it('subagent session returns undefined when no personaBody', async () => {
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testGetSystemPrompt('telegram:user123:subagent:abc12345')).toBeUndefined();
  });

  it('subagent session returns undefined for empty personaBody', async () => {
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testGetSystemPrompt('telegram:user123:subagent:abc12345', '   ')).toBeUndefined();
  });

  it('non-subagent session still loads bootstrap files', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Normal Agent');
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testGetSystemPrompt('telegram:user123')).toContain('# Normal Agent');
  });

  it('cron session is not treated as subagent', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Cron Agent');
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testGetSystemPrompt('cron:daily:2026-05-22')).toContain('# Cron Agent');
  });
});

// ── Subagent persona loading ─────────────────────────────────────────────────

describe('subagent persona loading', () => {
  let tmpDir: string;
  let agentsDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `subagent-load-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(path.join(agentsDir, 'default.md'), '---\nallowedTools: []\n---\n');
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('subagent session loads subagent.md persona instead of channel persona', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '---\nallowedTools:\n  - memory.*\n---\n\nSubagent preamble.\n');
    const runtime = await createTestRuntime(tmpDir);
    const persona = await runtime.testLoadPersonaIfChannel('telegram:user123:subagent:abc12345');
    expect(persona).not.toBeNull();
    expect(persona!.meta.allowedTools).toEqual(['memory.*']);
    expect(persona!.body).toBe('Subagent preamble.');
  });

  it('subagent session returns null when subagent.md is missing', async () => {
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testLoadPersonaIfChannel('telegram:user123:subagent:abc12345')).toBeNull();
  });

  it('non-subagent channel session loads channel persona, not subagent.md', async () => {
    writeFileSync(path.join(agentsDir, 'subagent.md'), '---\nallowedTools:\n  - memory.*\n---\n\nSubagent preamble.\n');
    writeFileSync(path.join(agentsDir, 'telegram.md'), '---\nallowedTools:\n  - channel.send\n---\n\nChannel body.\n');
    const runtime = await createTestRuntime(tmpDir, [], [{ id: 'telegram', type: 'telegram', botToken: 'test-token' }]);
    const persona = await runtime.testLoadPersonaIfChannel('telegram:foo');
    expect(persona).not.toBeNull();
    expect(persona!.meta.allowedTools).toEqual(['channel.send']);
    expect(persona!.body).toBe('Channel body.');
  });

  it('non-channel session (cron) returns null persona', async () => {
    const runtime = await createTestRuntime(tmpDir);
    expect(await runtime.testLoadPersonaIfChannel('cron:daily:2026-05-22')).toBeNull();
  });
});

// ── Tool filtering via allowedTools glob ─────────────────────────────────────

describe('subagent tool filtering via allowedTools', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  const allTools = [
    'agent.execute', 'agent.status', 'channel.send', 'channel.sendMedia',
    'memory.search', 'memory.read', 'memory.write', 'media.describeImage',
    'cron.add', 'mcp.github.create_issue',
  ];

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `subagent-tools-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    originalEnv = process.env.VARGOS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VARGOS_DATA_DIR;
    else process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all tools when no allowedPatterns provided', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    expect(await runtime.testGetCustomTools('telegram:user123')).toHaveLength(allTools.length);
  });

  it('filters tools by glob patterns matching label (event name with dots)', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    const tools = await runtime.testGetCustomTools('telegram:user123', ['memory.*', 'media.*']);
    expect(tools.map(t => t.label)).toEqual(['memory.search', 'memory.read', 'memory.write', 'media.describeImage']);
  });

  it('excludes agent.execute and channel.send with subagent-style allowlist', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    const tools = await runtime.testGetCustomTools('telegram:user123:subagent:abc12345', ['memory.*', 'media.*', 'cron.*', 'mcp.*', 'agent.status']);
    const labels = tools.map(t => t.label);
    expect(labels).not.toContain('agent.execute');
    expect(labels).not.toContain('channel.send');
    expect(labels).not.toContain('channel.sendMedia');
    expect(labels).toContain('memory.search');
    expect(labels).toContain('media.describeImage');
    expect(labels).toContain('agent.status');
    expect(labels).toContain('mcp.github.create_issue');
  });

  it('exact match pattern works', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    expect((await runtime.testGetCustomTools('telegram:user123', ['agent.status'])).map(t => t.label)).toEqual(['agent.status']);
  });

  it('wildcard * matches everything', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    expect(await runtime.testGetCustomTools('telegram:user123', ['*'])).toHaveLength(allTools.length);
  });

  it('non-matching patterns yield empty tools', async () => {
    const runtime = await createTestRuntime(tmpDir, toolMethods(allTools));
    expect(await runtime.testGetCustomTools('telegram:user123', ['nonexistent.*'])).toHaveLength(0);
  });

  it('returns no tools when the registry is empty', async () => {
    const runtime = await createTestRuntime(tmpDir, []);
    expect(await runtime.testGetCustomTools('telegram:user123', ['memory.*'])).toHaveLength(0);
  });
});
