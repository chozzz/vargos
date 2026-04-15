/**
 * MCP (Model Context Protocol) configuration schemas
 *
 * Two patterns:
 * 1. config.mcp — edge/mcp service exposes bus events as MCP tools to external clients
 * 2. config.mcpServers — mcp-client service imports external MCP servers as bus events
 */

import { z } from 'zod';

// ─── MCP edge (HTTP bridge) ──────────────────────────────────────────────────
// Used by edge/mcp service to expose vargos tools to external MCP clients

export const McpClientConfigSchema = z.object({
  bearerToken: z.string().optional(),
  host:        z.string().optional(),
  port:        z.number().int().min(1).max(65535).optional(),
  endpoint:    z.string().optional(),
  transport:   z.enum(['http', 'stdio']).optional(),
});

export type McpClientConfig = z.infer<typeof McpClientConfigSchema>;

// ─── MCP server connections ──────────────────────────────────────────────────
// Used by mcp-client service to load external MCP servers
//
// Flexible schema supporting stdio transport.
// Minimal validation — allows any extra fields for extensibility.
//
// Example configs:
//
// Stdio (uses command + optional args/env):
// {
//   "command": "uvx",
//   "args": ["mcp-atlassian"],
//   "env": { "JIRA_URL": "..." },
//   "enabled": true
// }
//
// Stdio shorthand:
// {
//   "command": "node /path/to/server.js"
// }

export const McpServerConfigSchema = z.record(z.string(), z.unknown()).describe(
  'MCP server config — command/args/env for stdio transport'
);

export type McpServerConfig = Record<string, unknown>;
