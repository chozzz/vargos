/**
 * MCP (Model Context Protocol) configuration schemas
 *
 * Two patterns:
 * 1. config.mcp — edge/mcp service exposes bus events as MCP tools to external clients
 * 2. config.mcpServers — mcp-client service imports external MCP servers as bus events
 */
import { z } from 'zod';
export declare const McpClientConfigSchema: z.ZodObject<{
    bearerToken: z.ZodOptional<z.ZodString>;
    host: z.ZodOptional<z.ZodString>;
    port: z.ZodOptional<z.ZodNumber>;
    endpoint: z.ZodOptional<z.ZodString>;
    transport: z.ZodOptional<z.ZodEnum<["http", "stdio"]>>;
}, "strip", z.ZodTypeAny, {
    bearerToken?: string | undefined;
    host?: string | undefined;
    port?: number | undefined;
    endpoint?: string | undefined;
    transport?: "http" | "stdio" | undefined;
}, {
    bearerToken?: string | undefined;
    host?: string | undefined;
    port?: number | undefined;
    endpoint?: string | undefined;
    transport?: "http" | "stdio" | undefined;
}>;
export type McpClientConfig = z.infer<typeof McpClientConfigSchema>;
export declare const McpServerConfigSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
export type McpServerConfig = Record<string, unknown>;
//# sourceMappingURL=mcp.d.ts.map