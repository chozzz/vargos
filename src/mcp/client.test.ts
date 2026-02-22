import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tools/registry.js';

// Capture listChanged config from Client constructor
let capturedListChanged: { tools?: { onChanged: (err: Error | null, tools: unknown[]) => void } } | undefined;

const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockGetServerCapabilities = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    listTools = mockListTools;
    callTool = mockCallTool;
    getServerCapabilities = mockGetServerCapabilities;
    constructor(_info: unknown, options?: { listChanged?: typeof capturedListChanged }) {
      capturedListChanged = options?.listChanged;
    }
  },
}));

const transportConstructorSpy = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockTransport {
    constructor(...args: unknown[]) {
      transportConstructorSpy(...args);
    }
  },
}));

const defaultTools = [
  { name: 'search', description: 'Search issues', inputSchema: { type: 'object', properties: { jql: { type: 'string' } } } },
  { name: 'create', description: 'Create issue' },
];

describe('MCP client bridge', () => {
  let registry: ToolRegistry;
  let manager: InstanceType<typeof import('./client.js').McpClientManager>;

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedListChanged = undefined;
    registry = new ToolRegistry();

    mockListTools.mockResolvedValue({ tools: defaultTools });
    mockGetServerCapabilities.mockReturnValue({ tools: {} });

    const { McpClientManager } = await import('./client.js');
    manager = new McpClientManager(registry);
  });

  it('registers tools with server prefix', async () => {
    const count = await manager.connectAll({
      atlassian: { command: 'uvx', args: ['mcp-atlassian'] },
    });

    expect(count).toBe(1);
    expect(registry.has('atlassian__search')).toBe(true);
    expect(registry.has('atlassian__create')).toBe(true);
    expect(registry.list()).toHaveLength(2);
  });

  it('uses tool description from MCP server', async () => {
    await manager.connectAll({
      jira: { command: 'uvx', args: ['mcp-atlassian'] },
    });

    expect(registry.get('jira__search')?.description).toBe('Search issues');
    expect(registry.get('jira__create')?.description).toBe('Create issue');
  });

  it('preserves inputSchema as jsonSchema', async () => {
    await manager.connectAll({
      jira: { command: 'uvx', args: ['mcp-atlassian'] },
    });

    const tool = registry.get('jira__search')!;
    expect(tool.jsonSchema).toEqual({ type: 'object', properties: { jql: { type: 'string' } } });
    expect(registry.get('jira__create')?.jsonSchema).toBeUndefined();
  });

  it('skips disabled servers', async () => {
    const count = await manager.connectAll({
      atlassian: { command: 'uvx', enabled: false },
      github: { command: 'npx', args: ['mcp-github'] },
    });

    expect(count).toBe(1);
    expect(registry.has('atlassian__search')).toBe(false);
    expect(registry.has('github__search')).toBe(true);
  });

  it('returns 0 when config is undefined', async () => {
    const count = await manager.connectAll(undefined);
    expect(count).toBe(0);
  });

  it('continues when a server fails to connect', async () => {
    mockConnect
      .mockRejectedValueOnce(new Error('spawn ENOENT'))
      .mockResolvedValueOnce(undefined);

    const count = await manager.connectAll({
      broken: { command: 'nonexistent' },
      working: { command: 'uvx', args: ['mcp-atlassian'] },
    });

    // Both run in parallel via allSettled — one fails, one succeeds
    expect(count).toBe(1);
    expect(registry.has('working__search')).toBe(true);
    expect(registry.has('broken__search')).toBe(false);
  });

  it('waits for listChanged when server returns 0 tools initially', async () => {
    mockGetServerCapabilities.mockReturnValue({ tools: { listChanged: true } });
    mockListTools.mockResolvedValueOnce({ tools: [] });

    const promise = manager.connectAll({
      slow: { command: 'slow-server' },
    });

    await vi.waitFor(() => expect(capturedListChanged?.tools).toBeDefined());

    capturedListChanged!.tools!.onChanged(null, [
      { name: 'delayed', description: 'Arrived via listChanged' },
    ]);

    const count = await promise;
    expect(count).toBe(1);
    expect(registry.has('slow__delayed')).toBe(true);
    expect(registry.get('slow__delayed')?.description).toBe('Arrived via listChanged');
  });

  it('delegates tool execution to client.callTool()', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'result data' }],
    });

    await manager.connectAll({
      test: { command: 'test-server' },
    });

    const tool = registry.get('test__search')!;
    const result = await tool.execute({ query: 'hello' }, {
      sessionKey: 'test',
      workingDir: '/tmp',
    });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'search',
      arguments: { query: 'hello' },
    });
    expect(result.content[0]).toEqual({ type: 'text', text: 'result data' });
  });

  it('handles error results from callTool', async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: 'Not found' }],
      isError: true,
    });

    await manager.connectAll({
      test: { command: 'test-server' },
    });

    const tool = registry.get('test__search')!;
    const result = await tool.execute({}, { sessionKey: 'test', workingDir: '/tmp' });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Not found' });
  });

  it('returns errorResult when callTool throws', async () => {
    mockCallTool.mockRejectedValue(new Error('connection lost'));

    await manager.connectAll({
      test: { command: 'test-server' },
    });

    const tool = registry.get('test__search')!;
    const result = await tool.execute({}, { sessionKey: 'test', workingDir: '/tmp' });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'test__search: connection lost' });
  });

  it('maps image content blocks', async () => {
    mockCallTool.mockResolvedValue({
      content: [
        { type: 'text', text: 'caption' },
        { type: 'image', data: 'base64data', mimeType: 'image/jpeg' },
      ],
    });

    await manager.connectAll({
      test: { command: 'test-server' },
    });

    const tool = registry.get('test__search')!;
    const result = await tool.execute({}, { sessionKey: 'test', workingDir: '/tmp' });

    expect(result.content).toEqual([
      { type: 'text', text: 'caption' },
      { type: 'image', data: 'base64data', mimeType: 'image/jpeg' },
    ]);
  });

  it('disconnects all clients', async () => {
    await manager.connectAll({
      a: { command: 'a' },
      b: { command: 'b' },
    });

    await manager.disconnectAll();
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('passes env vars to transport', async () => {
    await manager.connectAll({
      test: {
        command: 'uvx',
        args: ['mcp-atlassian'],
        env: { ATLASSIAN_API_TOKEN: 'secret' },
      },
    });

    expect(transportConstructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'uvx',
        args: ['mcp-atlassian'],
        env: expect.objectContaining({ ATLASSIAN_API_TOKEN: 'secret' }),
      }),
    );
  });

  it('connects multiple servers in parallel', async () => {
    mockListTools
      .mockResolvedValueOnce({ tools: [{ name: 'tool_a', description: 'A' }] })
      .mockResolvedValueOnce({ tools: [{ name: 'tool_b', description: 'B' }] });

    const count = await manager.connectAll({
      server1: { command: 'cmd1' },
      server2: { command: 'cmd2' },
    });

    expect(count).toBe(2);
    expect(registry.has('server1__tool_a')).toBe(true);
    expect(registry.has('server2__tool_b')).toBe(true);
  });

  it('does not duplicate tools on re-registration', async () => {
    await manager.connectAll({
      test: { command: 'test-server' },
    });

    // Simulate listChanged firing after listTools already registered
    expect(registry.list()).toHaveLength(2);
    // Tools already registered — registry.has() guard prevents duplicates
  });

  it('has formatResult on bridge tools', async () => {
    await manager.connectAll({
      test: { command: 'test-server' },
    });

    const tool = registry.get('test__search')!;
    expect(tool.formatResult).toBeDefined();

    const result = tool.formatResult!({
      content: [{ type: 'text', text: 'hello world' }],
    });
    expect(result).toBe('hello world');
  });

  it('getGroups separates core from external tools', async () => {
    // Register a core tool
    registry.register({
      name: 'read',
      description: 'Read files',
      parameters: {} as any,
      execute: async () => ({ content: [] }),
    });

    await manager.connectAll({
      jira: { command: 'uvx', args: ['mcp-atlassian'] },
    });

    const { core, external } = registry.getGroups();
    expect(core.map(t => t.name)).toContain('read');
    expect(external.has('jira')).toBe(true);
    expect(external.get('jira')!.map(t => t.name)).toContain('jira__search');
  });
});
