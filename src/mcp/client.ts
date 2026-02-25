/**
 * External MCP server bridge — spawns configured MCP servers,
 * discovers their tools, and registers them in the Vargos tool registry.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { McpServerEntry } from '../config/pi-config.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Tool, ToolContent, ToolResult } from '../tools/types.js';
import { errorResult } from '../tools/types.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('mcp');

/** Separator between server name and tool name — avoids `:` which confuses some LLMs */
export const EXTERNAL_TOOL_SEPARATOR = '__';

/** Max time to wait for tools if the server returns 0 initially */
const TOOL_READY_TIMEOUT_MS = 30_000;

interface McpConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

type McpToolInfo = { name: string; description?: string; inputSchema?: unknown };

export class McpClientManager {
  private connections: McpConnection[] = [];
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Connect to all configured external MCP servers and register their tools.
   * Connections run in parallel. Returns the number of servers successfully connected.
   */
  async connectAll(servers: Record<string, McpServerEntry> | undefined): Promise<number> {
    if (!servers) return 0;

    const entries = Object.entries(servers).filter(([, e]) => e.enabled !== false);
    if (entries.length === 0) return 0;

    const results = await Promise.allSettled(
      entries.map(([name, entry]) => this.connectOne(name, entry)),
    );

    let connected = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        connected++;
        log.info(`${entries[i][0]}: connected, ${r.value} tools registered`);
      } else {
        log.error(`${entries[i][0]}: failed — ${r.reason?.message ?? r.reason}`);
      }
    }

    return connected;
  }

  private async connectOne(name: string, entry: McpServerEntry): Promise<number> {
    const envs = {
      ...process.env,
      FASTMCP_SHOW_SERVER_BANNER: '0',
      ...entry.env
    } as Record<string, string>;

    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args,
      env: envs,
      stderr: 'pipe',
    });

    let resolveTools: ((count: number) => void) | undefined;
    const toolsReady = new Promise<number>((r) => { resolveTools = r; });

    const client = new Client(
      { name: `vargos:${name}`, version: '1.0.0' },
      {
        capabilities: {},
        listChanged: {
          tools: {
            onChanged: (err, tools) => {
              if (err || !tools || !resolveTools) return;
              for (const tool of tools) {
                if (!this.registry.has(`${name}${EXTERNAL_TOOL_SEPARATOR}${(tool as McpToolInfo).name}`)) {
                  this.registry.register(createBridgeTool(name, tool as McpToolInfo, client));
                }
              }
              resolveTools?.(tools.length);
            },
          },
        },
      },
    );

    await client.connect(transport);
    transport.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) log.debug(`${name}: ${line}`);
    });
    this.connections.push({ name, client, transport });

    const { tools } = await client.listTools();
    if (tools.length > 0) {
      for (const tool of tools) {
        if (!this.registry.has(`${name}${EXTERNAL_TOOL_SEPARATOR}${tool.name}`)) {
          this.registry.register(createBridgeTool(name, tool, client));
        }
      }
      resolveTools = undefined;
      return tools.length;
    }

    // Fallback: wait for listChanged if server supports it
    const caps = client.getServerCapabilities();
    if (!caps?.tools?.listChanged) return 0;

    log.info(`${name}: waiting for tools via listChanged...`);
    const timeout = new Promise<number>((r) => setTimeout(() => r(0), TOOL_READY_TIMEOUT_MS));
    return Promise.race([toolsReady, timeout]);
  }

  async disconnectAll(): Promise<void> {
    for (const conn of this.connections) {
      try {
        await conn.client.close();
      } catch {
        // already closed
      }
    }
    this.connections.length = 0;
  }
}

/** Map MCP content blocks to Vargos ToolContent, handling text + image */
function mapMcpContent(blocks: unknown): ToolContent[] {
  if (!Array.isArray(blocks)) return [{ type: 'text', text: JSON.stringify(blocks) }];
  return blocks.map((b: { type: string; text?: string; data?: string; mimeType?: string }) => {
    if (b.type === 'text' && b.text !== undefined) return { type: 'text' as const, text: b.text };
    if (b.type === 'image' && b.data) return { type: 'image' as const, data: b.data, mimeType: b.mimeType ?? 'image/png' };
    return { type: 'text' as const, text: JSON.stringify(b) };
  });
}

/** Wrap an MCP server tool as a Vargos Tool that delegates to client.callTool() */
function createBridgeTool(
  serverName: string,
  mcpTool: McpToolInfo,
  client: Client,
): Tool {
  const prefixedName = `${serverName}${EXTERNAL_TOOL_SEPARATOR}${mcpTool.name}`;
  const parameters = z.record(z.unknown()).optional().default({});

  return {
    name: prefixedName,
    description: mcpTool.description || `${serverName} tool`,
    parameters,
    jsonSchema: mcpTool.inputSchema,
    async execute(args: unknown): Promise<ToolResult> {
      try {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: (args as Record<string, unknown>) || {},
        });
        return { content: mapMcpContent(result.content), isError: result.isError as boolean | undefined };
      } catch (err) {
        return errorResult(`${prefixedName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    formatCall: (args: Record<string, unknown>) =>
      `${prefixedName}(${Object.keys(args).join(', ')})`,
    formatResult: (result: ToolResult) => {
      const text = result.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
      return text.slice(0, 120);
    },
  };
}
