/**
 * MCP bridge — translates MCP protocol to gateway RPC
 *
 * ListToolsRequest  → tool.list
 * CallToolRequest   → tool.execute
 *
 * Supports both stdio and HTTP transports.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'node:http';
import { ServiceClient } from '../client/client.js';
import { resolveWorkspaceDir } from '../config/paths.js';
import type { ToolResult } from '../contracts/tool.js';

interface ToolSchema { name: string; description: string; parameters: Record<string, unknown> }

export function buildOpenApiSpec(tools: ToolSchema[], version: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const t of tools) {
    paths[`/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.description,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: t.parameters } },
        },
        responses: {
          '200': {
            description: 'Tool result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ToolResult' },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Vargos', version, description: 'MCP runtime tool API' },
    paths,
    components: {
      schemas: {
        ToolResult: {
          type: 'object',
          required: ['content'],
          properties: {
            content: {
              type: 'array',
              items: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['type', 'text'],
                    properties: { type: { const: 'text' }, text: { type: 'string' } },
                  },
                  {
                    type: 'object',
                    required: ['type', 'data', 'mimeType'],
                    properties: {
                      type: { const: 'image' },
                      data: { type: 'string', description: 'Base64-encoded image' },
                      mimeType: { type: 'string' },
                    },
                  },
                ],
              },
            },
            isError: { type: 'boolean' },
          },
        },
      },
    },
  };
}

export interface McpBridgeConfig {
  gatewayUrl?: string;
  version?: string;
}

export class McpBridge extends ServiceClient {
  private mcpServer: Server;
  private httpServer?: http.Server;
  private mcpVersion: string;

  constructor(config: McpBridgeConfig = {}) {
    super({
      service: 'mcp',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.mcpVersion = config.version ?? '0.0.1';
    this.mcpServer = new Server(
      { name: 'vargos', version: this.mcpVersion },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  async handleMethod(): Promise<unknown> {
    throw new Error('MCP bridge handles no gateway methods');
  }

  handleEvent(): void {
    // MCP bridge subscribes to nothing
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  async startHttp(config: { host: string; port: number; endpoint: string }): Promise<void> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await this.mcpServer.connect(transport);

    this.httpServer = http.createServer(async (req, res) => {
      // MCP clients connect from various hosts; restrict via gateway.host binding instead
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/openapi.json' && req.method === 'GET') {
        try {
          const tools = await this.call<ToolSchema[]>('tools', 'tool.list');
          const spec = buildOpenApiSpec(tools, this.mcpVersion);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(spec, null, 2));
        } catch {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'Tools service unavailable' }));
        }
        return;
      }

      if (!req.url?.startsWith(config.endpoint)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      try {
        await transport.handleRequest(req, res);
      } catch {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    return new Promise((resolve) => {
      this.httpServer!.listen(config.port, config.host, () => resolve());
    });
  }

  async stopHttp(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close(() => resolve());
    });
  }

  private setupHandlers(): void {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.call<Array<{ name: string; description: string; parameters: unknown }>>('tools', 'tool.list');
      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters as Record<string, unknown>,
        })),
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      const workspaceDir = resolveWorkspaceDir();
      const sessionKey = (args as Record<string, unknown>)?.sessionKey as string || 'mcp:default';

      try {
        const result = await this.call<ToolResult>('tools', 'tool.execute', {
          name,
          args,
          context: { sessionKey, workingDir: workspaceDir },
        });
        return { content: result.content, isError: result.isError };
      } catch (err) {
        return {
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    });
  }
}
