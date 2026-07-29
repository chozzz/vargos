/**
 * MCP edge service — translates MCP protocol to bus event calls.
 *
 * ListToolsRequest  → bus.list()
 * CallToolRequest   → bus.call(method, args)
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
import type { Bus, Service } from '../../core/types.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';

const log = createLogger('mcp');

const VERSION = '0.0.1';

// ── McpEdge ────────────────────────────────────────────────────────────────────

export class McpEdge implements Service {
  readonly name = 'edge-mcp';
  private mcpServer: Server;
  private httpServer: http.Server | null = null;
  private bus!: Bus;
  private config!: AppConfig;

  constructor() {
    this.mcpServer = new Server(
      { name: 'vargos', version: VERSION },
      { capabilities: { tools: {} } },
    );
  }

  async init(bus: Bus): Promise<void> {
    this.bus = bus;
    this.config = await bus.call<AppConfig>('config.get', {});
    this.setupHandlers();
    await this.start();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private httpHost(): string {
    return this.config.mcp.host ?? '127.0.0.1';
  }

  private httpPort(): number {
    const envPort = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : undefined;
    return envPort ?? this.config.mcp.port ?? 9001;
  }

  /** Path prefix for Streamable HTTP, always starts with / */
  private httpEndpointPath(): string {
    const ep = this.config.mcp.endpoint ?? '/mcp';
    return ep.startsWith('/') ? ep : `/${ep}`;
  }

  async start(): Promise<void> {
    const bt = this.config.mcp.bearerToken;
    if (!bt) {
      log.warn(`no bearerToken set — serving without auth (${this.httpHost()}:${this.httpPort()}${this.httpEndpointPath()})`);
    }
    await this.startHttp(bt ?? null);
  }

  async stop(): Promise<void> {
    await this.stopHttp();
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  // ── HTTP transport ─────────────────────────────────────────────────────────

  private async startHttp(bearerToken: string | null): Promise<void> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await this.mcpServer.connect(transport);

    const expectedHash = bearerToken
      ? createHash('sha256').update(`Bearer ${bearerToken}`).digest()
      : null;

    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Bearer token auth (only enforced when a token is configured)
      if (expectedHash) {
        const auth     = req.headers.authorization ?? '';
        const authHash = createHash('sha256').update(auth).digest();
        if (!timingSafeEqual(authHash, expectedHash)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
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

      if (!req.url?.startsWith(this.httpEndpointPath())) {
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

    const host = this.httpHost();
    const port = this.httpPort();
    return new Promise((resolve) => {
      this.httpServer!.listen(port, host, () => {
        log.info(`MCP server listening on ${host}:${port}${this.httpEndpointPath()}${bearerToken ? ' (auth enabled)' : ' (no auth)'}`);
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
      return {
        tools: this.bus.list().filter(m => !m.internal).map(m => ({
          name:        m.name,
          description: m.description,
          inputSchema: (m.schema ?? {}) as Record<string, unknown>,
        })),
      };
    });

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      if (!this.bus.has(name)) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      try {
        const result = await this.bus.call(name, args);
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
    const tools = this.bus.list().filter(m => !m.internal);
    const paths: Record<string, unknown> = {};

    for (const m of tools) {
      paths[`/tools/${m.name}`] = {
        post: {
          operationId: m.name,
          summary:     m.description,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: m.schema ?? {} } },
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

export function createService(): Service {
  return new McpEdge();
}
