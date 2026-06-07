/**
 * MCP edge service — translates MCP protocol to bus event calls.
 *
 * ListToolsRequest  → bus.search()
 * CallToolRequest   → bus.call(eventName, args)
 *
 * Supports HTTP (StreamableHTTP) transport on port 9001.
 * Bearer token auth from config.mcp.bearerToken.
 */
import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
export declare class McpEdge {
    private readonly bus;
    private readonly config;
    private mcpServer;
    private httpServer;
    constructor(bus: Bus, config: AppConfig);
    private httpHost;
    private httpPort;
    /** Path prefix for Streamable HTTP, always starts with / */
    private httpEndpointPath;
    start(): Promise<void>;
    stop(): Promise<void>;
    startStdio(): Promise<void>;
    private startHttp;
    private stopHttp;
    private setupHandlers;
    private buildOpenApiSpec;
}
export declare function boot(bus: Bus): Promise<{
    stop(): Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map