/**
 * MCP edge service — translates MCP protocol to bus event calls.
 *
 * ListToolsRequest  → bus.search()
 * CallToolRequest   → bus.call(eventName, args)
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
import { isToolEvent } from '../../gateway/emitter.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { getDataPaths } from '../../lib/paths.js';

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
        this.buildOpenApiSpec().then(spec => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(spec, null, 2));
        }).catch(err => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: toMessage(err) }));
        });
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
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const metadata = await this.bus.call('bus.search', {});
      const tools = metadata.filter(isToolEvent);
      return {
        tools: tools.map(m => ({
          name:        m.event,
          description: m.description,
          inputSchema: (m.schema?.params ?? {}) as Record<string, unknown>,
        })),
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      const sessionKey = (args as Record<string, unknown>)?.sessionKey as string || 'mcp:default';

      // Check if event exists in bus
      const metadata = await this.bus.call('bus.inspect', { event: name });
      if (!metadata || metadata.type !== 'callable') {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const result = await this.bus.call(name as never, args);
        // Convert result to MCP format
        const resultText = result && typeof result === 'object' ? JSON.stringify(result) : String(result);
        return { content: [{ type: 'text', text: resultText }], isError: false };
      } catch (err) {
        return {
          content: [{ type: 'text', text: toMessage(err) }],
          isError: true,
        };
      }
    });
  }

  private async buildOpenApiSpec(): Promise<Record<string, unknown>> {
    const metadata = await this.bus.call('bus.search', {});
    const tools = metadata.filter(isToolEvent);
    const paths: Record<string, unknown> = {};

    for (const m of tools) {
      paths[`/tools/${m.event}`] = {
        post: {
          operationId: m.event,
          summary:     m.description,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: m.schema?.params ?? {} } },
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
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
      },
    };
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const config = await bus.call('config.get', {});
  const svc = new McpEdge(bus, config);
  await svc.start();
  return { stop: () => svc.stop() };
}
