import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GatewayServer } from '../gateway/server.js';
import { ToolsService } from '../tools/service.js';
import { ToolRegistry } from '../tools/registry.js';
import type { Tool } from '../tools/types.js';
import { buildOpenApiSpec, McpBridge } from './server.js';

const echoTool: Tool = {
  name: 'echo',
  description: 'Echoes input',
  parameters: z.object({ message: z.string().describe('The message to echo') }),
  async execute(args: unknown) {
    const { message } = args as { message: string };
    return { content: [{ type: 'text' as const, text: message }] };
  },
};

const readTool: Tool = {
  name: 'read',
  description: 'Read a file',
  parameters: z.object({
    path: z.string().describe('File path'),
    offset: z.number().optional().describe('Line offset'),
  }),
  async execute() {
    return { content: [{ type: 'text' as const, text: 'file content' }] };
  },
};

describe('buildOpenApiSpec', () => {
  it('generates valid OpenAPI 3.1 spec', () => {
    const tools = [
      { name: 'echo', description: 'Echoes input', parameters: zodToJsonSchema(echoTool.parameters) },
    ];
    const spec = buildOpenApiSpec(tools, '0.1.0') as Record<string, unknown>;

    expect(spec.openapi).toBe('3.1.0');
    expect((spec.info as Record<string, unknown>).version).toBe('0.1.0');
    expect((spec.info as Record<string, unknown>).title).toBe('Vargos');
  });

  it('maps each tool to a POST /tools/{name} path', () => {
    const tools = [
      { name: 'echo', description: 'Echoes input', parameters: zodToJsonSchema(echoTool.parameters) },
      { name: 'read', description: 'Read a file', parameters: zodToJsonSchema(readTool.parameters) },
    ];
    const spec = buildOpenApiSpec(tools, '0.1.0');
    const paths = spec.paths as Record<string, Record<string, unknown>>;

    expect(paths['/tools/echo']).toBeDefined();
    expect(paths['/tools/read']).toBeDefined();
    expect((paths['/tools/echo'].post as Record<string, unknown>).operationId).toBe('echo');
    expect((paths['/tools/echo'].post as Record<string, unknown>).summary).toBe('Echoes input');
  });

  it('includes ToolResult schema in components', () => {
    const spec = buildOpenApiSpec([], '0.1.0');
    const schemas = (spec.components as Record<string, unknown>).schemas as Record<string, unknown>;

    expect(schemas.ToolResult).toBeDefined();
    const result = schemas.ToolResult as Record<string, unknown>;
    expect((result.required as string[])).toContain('content');
  });

  it('includes tool input schema in request body', () => {
    const tools = [
      { name: 'echo', description: 'Echoes input', parameters: zodToJsonSchema(echoTool.parameters) },
    ];
    const spec = buildOpenApiSpec(tools, '0.1.0');
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const post = paths['/tools/echo'].post;
    const body = post.requestBody as Record<string, unknown>;
    const content = body.content as Record<string, Record<string, unknown>>;
    const schema = content['application/json'].schema as Record<string, unknown>;

    expect(schema.properties).toBeDefined();
    expect((schema.properties as Record<string, unknown>).message).toBeDefined();
  });
});

describe('GET /openapi.json', () => {
  const GW_PORT = 19807;
  const MCP_PORT = 19808;
  const GW_URL = `ws://127.0.0.1:${GW_PORT}`;

  let gateway: GatewayServer;
  let tools: ToolsService;
  let bridge: McpBridge;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: GW_PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(readTool);

    tools = new ToolsService({ registry, gatewayUrl: GW_URL });
    await tools.connect();

    bridge = new McpBridge({ gatewayUrl: GW_URL, version: '0.1.0' });
    await bridge.connect();
    await bridge.startHttp({ host: '127.0.0.1', port: MCP_PORT, endpoint: '/mcp' });
  });

  afterEach(async () => {
    await bridge.stopHttp();
    await bridge.disconnect();
    await tools.disconnect();
    await gateway.stop();
  });

  it('returns OpenAPI spec with registered tools', async () => {
    const res = await fetch(`http://127.0.0.1:${MCP_PORT}/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');

    const spec = await res.json() as Record<string, unknown>;
    expect(spec.openapi).toBe('3.1.0');

    const paths = Object.keys(spec.paths as Record<string, unknown>);
    expect(paths).toContain('/tools/echo');
    expect(paths).toContain('/tools/read');
    expect(paths).toHaveLength(2);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://127.0.0.1:${MCP_PORT}/nope`);
    expect(res.status).toBe(404);
  });
});
