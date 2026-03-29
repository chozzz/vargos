/**
 * MCP edge service — translates MCP protocol to direct tool registry calls.
 *
 * ListToolsRequest  → toolRegistry.list()
 * CallToolRequest   → toolRegistry.get(name)?.execute(args, context)
 *
 * Supports HTTP (StreamableHTTP) transport on port 9001.
 * Bearer token auth from config.mcp.bearerToken.
 */

import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';
import { toolRegistry } from '../../services/tools/registry.js';

const log = createLogger('mcp');

const HTTP_PORT = 9001;
const HTTP_HOST = '127.0.0.1';
const ENDPOINT  = '/mcp';
const VERSION   = '0.0.1';

// ── McpEdge ────────────────────────────────────────────────────────────────────

export class McpEdge {
  private mcpServer: Server;
  private httpServer: http.Server | null = null;

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {
    this.mcpServer = new Server(
      { name: 'vargos', version: VERSION },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  async start(): Promise<void> {
    if (this.config.mcp.bearerToken) {
      await this.startHttp(this.config.mcp.bearerToken);
    } else {
      log.info('no bearerToken — skipping HTTP; use stdio transport');
    }
    log.info('started');
  }

  async stop(): Promise<void> {
    await this.stopHttp();
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  // ── HTTP transport ─────────────────────────────────────────────────────────

  private async startHttp(bearerToken: string): Promise<void> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await this.mcpServer.connect(transport);

    const expectedHash = createHash('sha256').update(`Bearer ${bearerToken}`).digest();

    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Timing-safe bearer token comparison (hash prevents length leakage)
      const auth     = req.headers.authorization ?? '';
      const authHash = createHash('sha256').update(auth).digest();
      if (!timingSafeEqual(authHash, expectedHash)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (req.url === '/openapi.json' && req.method === 'GET') {
        const spec = buildOpenApiSpec();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(spec, null, 2));
        return;
      }

      if (!req.url?.startsWith(ENDPOINT)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      try {
        await transport.handleRequest(req, res);
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    return new Promise((resolve) => {
      this.httpServer!.listen(HTTP_PORT, HTTP_HOST, () => {
        log.info(`http listening on ${HTTP_HOST}:${HTTP_PORT}`);
        resolve();
      });
    });
  }

  private stopHttp(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.httpServer) return resolve();
      this.httpServer.close(() => resolve());
      this.httpServer = null;
    });
  }

  // ── MCP handlers ───────────────────────────────────────────────────────────

  private setupHandlers(): void {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, () => {
      const tools = toolRegistry.list();
      return {
        tools: tools.map(t => ({
          name:        t.name,
          description: t.description,
          inputSchema: (t.jsonSchema ?? zodToJsonSchema(t.parameters)) as Record<string, unknown>,
        })),
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      const { workspaceDir } = getDataPaths();
      const sessionKey = (args as Record<string, unknown>)?.sessionKey as string || 'mcp:default';

      const tool = toolRegistry.get(name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const result = await tool.execute(args, {
          sessionKey,
          workingDir: workspaceDir,
          bus: this.bus,
        });
        return { content: result.content, isError: result.isError };
      } catch (err) {
        return {
          content: [{ type: 'text', text: toMessage(err) }],
          isError: true,
        };
      }
    });
  }
}

// ── OpenAPI spec builder ───────────────────────────────────────────────────────

function buildOpenApiSpec(): Record<string, unknown> {
  const tools = toolRegistry.list();
  const paths: Record<string, unknown> = {};

  for (const t of tools) {
    const schema = (t.jsonSchema ?? zodToJsonSchema(t.parameters)) as Record<string, unknown>;
    paths[`/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary:     t.description,
        requestBody: {
          required: true,
          content: { 'application/json': { schema } },
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
    info:    { title: 'Vargos', version: VERSION, description: 'Vargos agent OS tool API' },
    paths,
    components: {
      schemas: {
        ToolResult: {
          type: 'object',
          required: ['content'],
          properties: {
            content: {
              type:  'array',
              items: {
                oneOf: [
                  {
                    type:       'object',
                    required:   ['type', 'text'],
                    properties: { type: { const: 'text' }, text: { type: 'string' } },
                  },
                  {
                    type:       'object',
                    required:   ['type', 'data', 'mimeType'],
                    properties: {
                      type:     { const: 'image' },
                      data:     { type: 'string', description: 'Base64-encoded image' },
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

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const config = await bus.call('config.get', {});
  const svc = new McpEdge(bus, config);
  await svc.start();
  return { stop: () => svc.stop() };
}
