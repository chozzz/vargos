/**
 * MCP client service — loads external MCP servers and exposes them as bus events.
 *
 * Inverse of edge/mcp:
 *   edge/mcp exports bus events as MCP tools to external clients (outbound)
 *   this service imports external MCP servers as bus events (inbound)
 *
 * MCP servers are configured in ~/.vargos/agent/mcp.json:
 *   {
 *     "mcpServers": {
 *       "server-name": { command: "node server.js" },
 *     }
 *   }
 *
 * Tools become callable events: mcp.server-name.toolName on the bus
 */
import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
export declare class McpClientService {
    private readonly bus;
    private readonly config;
    private servers;
    constructor(bus: Bus, config: AppConfig);
    start(): Promise<void>;
    private connectServer;
    /**
     * Convert JSON Schema to Zod schema.
     * Handles common JSON Schema properties like type, properties, required, etc.
     */
    private jsonSchemaToZod;
    private registerToolHandler;
    stop(): Promise<void>;
}
export declare function boot(bus: Bus): Promise<{
    stop(): Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map