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
import { ServiceClient } from '../services/client.js';
import { resolveWorkspaceDir } from '../core/config/paths.js';
import type { ToolResult } from '../core/tools/types.js';

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

      if (!req.url?.startsWith(config.endpoint)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      try {
        await transport.handleRequest(req, res);
      } catch (err) {
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
