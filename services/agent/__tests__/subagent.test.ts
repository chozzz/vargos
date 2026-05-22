import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentService } from '../index.js';
import { loadSubagentPersona } from '../persona.js';
import { AppConfigSchema } from '../../config/index.js';
import type { Bus } from '../../../gateway/bus.js';
import type { EventMetadata } from '../../../gateway/events.js';
import { resetDataPaths } from '../../../lib/paths.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

class TestableRuntime extends AgentService {
  async testGetSystemPrompt(sessionKey: string, metadata?: Parameters<AgentService['getSystemPrompt']>[1], personaBody?: string) {
    return this.getSystemPrompt(sessionKey, metadata, personaBody);
  }

  async testLoadPersonaIfChannel(sessionKey: string) {
    return this['loadPersonaIfChannel'](sessionKey);
  }

  async testGetCustomTools(sessionKey: string, allowedPatterns?: string[]) {
    return this.getCustomTools(sessionKey, allowedPatterns);
  }
}

function createTestRuntime(
  dataDir: string,
  busCallOverrides?: Record<string, unknown>,
  channels?: Array<{ id: string; type: string; botToken?: string }>,
): TestableRuntime {
  const minimalConfig = AppConfigSchema.parse({
    providers: {
      test: {
        baseUrl: 'http://localhost:1234',
        apiKey: 'test-key',
        api: 'openai-completions',
        models: [{ id: 'test-model', name: 'Test Model' }],
      },
    },
    agent: { model: 'test:test-model' },
    ...(channels && { channels }),
  });

  resetDataPaths();
  process.env.VARGOS_DATA_DIR = dataDir;

  const mockBus = {
    call: async (event: string, _params?: unknown) => {
      if (busCallOverrides && event in busCallOverrides) {
        return busCallOverrides[event];
      }
      return {};
    },
  } as unknown as Bus;

  return new TestableRuntime({ bus: mockBus, config: minimalConfig });
}

/** Build EventMetadata entries that pass isToolEvent() filter. */
function makeToolMetadata(events: string[]): EventMetadata[] {
  return events.map(event => ({
    event,
    description: `Tool: ${event}`,
    type: 'tool' as const,
    schema: { params: {} },
  }));
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
    const result = await loadSubagentPersona();
    expect(result).toBeNull();
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
    writeFileSync(
      path.join(agentsDir, 'subagent.md'),
      '---\nallowedTools:\n  - memory.*\n  - web.*\n---\n\nYou are a subagent.\n',
    );
    const result = await loadSubagentPersona();
    expect(result).not.toBeNull();
    expect(result!.meta.allowedTools).toEqual(['memory.*', 'web.*']);
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
    writeFileSync(
      path.join(agentsDir, 'subagent.md'),
      '---\nallowedTools:\n  - memory.search\n---\n',
    );
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
    const runtime = createTestRuntime(tmpDir);

    const prompt = await runtime.testGetSystemPrompt(
      'telegram:user123:subagent:abc12345',
      undefined,
      'You are a subagent.',
    );

    expect(prompt).toBe('You are a subagent.');
    expect(prompt).not.toContain('WORKSPACE_CONTENT_SHOULD_NOT_APPEAR');
  });

  it('subagent session returns undefined when no personaBody', async () => {
    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('telegram:user123:subagent:abc12345');
    expect(prompt).toBeUndefined();
  });

  it('subagent session returns undefined for empty personaBody', async () => {
    const runtime = createTestRuntime(tmpDir);
    const prompt = await runtime.testGetSystemPrompt('telegram:user123:subagent:abc12345', undefined, '   ');
    expect(prompt).toBeUndefined();
  });

  it('non-subagent session still loads bootstrap files', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Normal Agent');
    const runtime = createTestRuntime(tmpDir);

    const prompt = await runtime.testGetSystemPrompt('telegram:user123');
    expect(prompt).toContain('# Normal Agent');
  });

  it('cron session is not treated as subagent', async () => {
    writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Cron Agent');
    const runtime = createTestRuntime(tmpDir);

    const prompt = await runtime.testGetSystemPrompt('cron:daily:2026-05-22');
    expect(prompt).toContain('# Cron Agent');
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
    // default.md needed for channel persona seeding
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
    writeFileSync(
      path.join(agentsDir, 'subagent.md'),
      '---\nallowedTools:\n  - memory.*\n---\n\nSubagent preamble.\n',
    );
    const runtime = createTestRuntime(tmpDir);

    const persona = await runtime.testLoadPersonaIfChannel('telegram:user123:subagent:abc12345');
    expect(persona).not.toBeNull();
    expect(persona!.meta.allowedTools).toEqual(['memory.*']);
    expect(persona!.body).toBe('Subagent preamble.');
  });

  it('subagent session returns null when subagent.md is missing', async () => {
    const runtime = createTestRuntime(tmpDir);
    const persona = await runtime.testLoadPersonaIfChannel('telegram:user123:subagent:abc12345');
    expect(persona).toBeNull();
  });

  it('non-subagent channel session loads channel persona, not subagent.md', async () => {
    writeFileSync(
      path.join(agentsDir, 'subagent.md'),
      '---\nallowedTools:\n  - memory.*\n---\n\nSubagent preamble.\n',
    );
    // Persona file is keyed by channel ID (the 'type' from parseSessionKey), not the full session key
    writeFileSync(
      path.join(agentsDir, 'telegram.md'),
      '---\nallowedTools:\n  - channel.send\n---\n\nChannel body.\n',
    );
    // Config must include 'telegram' as a channel so loadPersonaIfChannel recognizes it
    const runtime = createTestRuntime(tmpDir, {}, [
      { id: 'telegram', type: 'telegram', botToken: 'test-token' },
    ]);

    // This is a regular channel session — should load telegram.md, not subagent.md
    const persona = await runtime.testLoadPersonaIfChannel('telegram:foo');
    expect(persona).not.toBeNull();
    expect(persona!.meta.allowedTools).toEqual(['channel.send']);
    expect(persona!.body).toBe('Channel body.');
  });

  it('non-channel session (cron) returns null persona', async () => {
    const runtime = createTestRuntime(tmpDir);
    const persona = await runtime.testLoadPersonaIfChannel('cron:daily:2026-05-22');
    expect(persona).toBeNull();
  });
});

// ── Tool filtering via allowedTools glob ─────────────────────────────────────

describe('subagent tool filtering via allowedTools', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  const allToolEvents = [
    'agent.execute',
    'agent.status',
    'channel.send',
    'channel.sendMedia',
    'memory.search',
    'memory.read',
    'memory.write',
    'web.fetch',
    'cron.add',
    'bus.search',
    'mcp.github.create_issue',
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
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const tools = await runtime.testGetCustomTools('telegram:user123');
    expect(tools).toHaveLength(allToolEvents.length);
  });

  it('filters tools by glob patterns matching label (event name with dots)', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const tools = await runtime.testGetCustomTools('telegram:user123', ['memory.*', 'web.*']);
    const labels = tools.map(t => t.label);
    expect(labels).toEqual(['memory.search', 'memory.read', 'memory.write', 'web.fetch']);
  });

  it('excludes agent.execute and channel.send with subagent-style allowlist', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const allowed = [
      'memory.*',
      'web.*',
      'cron.*',
      'bus.*',
      'mcp.*',
      'agent.status',
    ];
    const tools = await runtime.testGetCustomTools('telegram:user123:subagent:abc12345', allowed);
    const labels = tools.map(t => t.label);

    expect(labels).not.toContain('agent.execute');
    expect(labels).not.toContain('channel.send');
    expect(labels).not.toContain('channel.sendMedia');
    expect(labels).toContain('memory.search');
    expect(labels).toContain('web.fetch');
    expect(labels).toContain('agent.status');
    expect(labels).toContain('mcp.github.create_issue');
  });

  it('exact match pattern works', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const tools = await runtime.testGetCustomTools('telegram:user123', ['agent.status']);
    expect(tools.map(t => t.label)).toEqual(['agent.status']);
  });

  it('wildcard * matches everything', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const tools = await runtime.testGetCustomTools('telegram:user123', ['*']);
    expect(tools).toHaveLength(allToolEvents.length);
  });

  it('non-matching patterns yield empty tools', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': makeToolMetadata(allToolEvents),
    });

    const tools = await runtime.testGetCustomTools('telegram:user123', ['nonexistent.*']);
    expect(tools).toHaveLength(0);
  });

  it('returns no tools when bus.search returns empty', async () => {
    const runtime = createTestRuntime(tmpDir, {
      'bus.search': [],
    });

    const tools = await runtime.testGetCustomTools('telegram:user123', ['memory.*']);
    expect(tools).toHaveLength(0);
  });
});
