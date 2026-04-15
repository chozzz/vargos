/**
 * MCP client service — loads external MCP servers and exposes them as bus events.
 *
 * Inverse of edge/mcp:
 *   edge/mcp exports bus events as MCP tools to external clients (outbound)
 *   this service imports external MCP servers as bus events (inbound)
 *
 * Config shape:
 *   config.mcpServers = {
 *     "server-name": { transport: "stdio", command: "node server.js" },
 *   }
 *
 * Tools become callable events: mcp.server-name.toolName on the bus
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';

const log = createLogger('mcp-client');

interface McpServerConnection {
  client: Client;
  tools: Map<string, Tool>;
  registeredTools: Set<string>; // track which tools are registered for cleanup
}

// ── McpClientService ──────────────────────────────────────────────────────────

export class McpClientService {
  private servers = new Map<string, McpServerConnection>();

  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) {}

  async start(): Promise<void> {
    if (!this.config.mcpServers || Object.keys(this.config.mcpServers).length === 0) {
      log.debug('no MCP servers configured');
      return;
    }

    for (const [name, serverConfig] of Object.entries(this.config.mcpServers)) {
      // Skip disabled servers
      if ((serverConfig as any).enabled === false) {
        log.debug(`MCP server disabled: ${name}`);
        continue;
      }

      try {
        await Promise.race([
          this.connectServer(name, serverConfig as Record<string, unknown>),
          // 5 second timeout per server to avoid hanging on unavailable servers
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('connection timeout')), 5000);
          }),
        ]);
      } catch (err) {
        log.warn(`MCP server ${name}: ${toMessage(err)}`);
        // Continue with other servers even if one fails
      }
    }

    if (this.servers.size > 0) {
      log.info(`connected ${this.servers.size} MCP server(s)`);
    } else if (Object.keys(this.config.mcpServers).length > 0) {
      log.debug(`no MCP servers available (${Object.keys(this.config.mcpServers).length} configured but not connectable)`);
    }
  }

  private async connectServer(name: string, config: Record<string, unknown>): Promise<void> {
    const transport = (config.transport as string) || 'stdio';

    if (transport !== 'stdio') {
      throw new Error(`transport not supported: ${transport} (only stdio supported currently)`);
    }

    // Support both "command" string and "command/args" format
    const cmdStr = config.command as string;
    if (!cmdStr) throw new Error(`server ${name}: stdio transport requires command`);

    let cmd: string;
    let args: string[] = [];

    if (Array.isArray(config.args)) {
      // Separate command and args arrays
      cmd = cmdStr;
      args = (config.args as string[]);
    } else {
      // Parse command string with space-separated args
      const parts = cmdStr.split(' ');
      cmd = parts[0];
      args = parts.slice(1);
    }

    // Extract optional env vars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (config.env as any) || {};

    const clientTransport = new StdioClientTransport({
      command: cmd,
      args,
      env: Object.keys(env).length > 0 ? { ...process.env, ...env } : undefined,
    });

    const client = new Client({
      name: `vargos-mcp-client-${name}`,
      version: '1.0.0',
    });

    try {
      await client.connect(clientTransport);
      const { tools } = await client.listTools();

      const toolMap = new Map(tools.map(t => [t.name, t]));
      const registeredTools = new Set<string>();
      this.servers.set(name, { client, tools: toolMap, registeredTools });

      log.info(`MCP server connected: ${name} (${tools.length} tools)`);

      // Dynamically register each tool as a bus callable event
      for (const tool of tools) {
        this.registerToolHandler(name, tool, registeredTools);
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (clientTransport as any).close?.();
      throw err;
    }
  }

  private registerToolHandler(serverName: string, tool: Tool, registeredTools: Set<string>): void {
    const eventName = `mcp.${serverName}.${tool.name}`;

    // Dynamically register the tool as a callable event
    const handler = async (params: unknown) => {
      const connection = this.servers.get(serverName);
      if (!connection) throw new Error(`MCP server not connected: ${serverName}`);

      try {
        const result = await connection.client.callTool({
          name: tool.name,
          arguments: params as Record<string, unknown>,
        });

        // Convert MCP response to bus event result
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = (result as any).content || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((result as any).isError) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const textContent = content.find((c: any) => c.type === 'text');
          throw new Error(textContent?.text || 'Tool error');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textContent = content.find((c: any) => c.type === 'text');
        return textContent
          ? { text: textContent.text }
          : { content };
      } catch (err) {
        log.error(`tool call failed: ${serverName}.${tool.name}: ${toMessage(err)}`);
        throw err;
      }
    };

    // Register with bus using the public registerTool API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (tool.inputSchema as any) || {};
    this.bus.registerTool(eventName, handler, schema);
    registeredTools.add(eventName);
  }

  async stop(): Promise<void> {
    for (const { client, registeredTools } of this.servers.values()) {
      // Unregister all tools
      for (const eventName of registeredTools) {
        this.bus.unregisterTool(eventName);
      }
      registeredTools.clear();

      // Close MCP client
      try {
        await (client as any).close?.();
      } catch {
        // best effort
      }
    }
    this.servers.clear();
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop(): Promise<void> }> {
  const config = await bus.call('config.get', {});
  const svc = new McpClientService(bus, config);
  await svc.start();
  return { stop: () => svc.stop() };
}
