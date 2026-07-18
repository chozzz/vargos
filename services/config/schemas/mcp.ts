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
  bearerToken: z.string().optional().describe('Bearer token expected by edge/mcp clients'),
  host: z.string().optional().describe('Bind host used by edge/mcp when exposing Vargos tools'),
  port: z.number().int().min(1).max(65535).optional().describe('Bind port used by edge/mcp when exposing Vargos tools'),
  endpoint: z.string().optional().describe('HTTP endpoint path served by edge/mcp'),
  transport: z.enum(['http', 'stdio']).optional().describe('Transport used by edge/mcp for external MCP clients'),
}).describe('MCP edge settings consumed by edge/mcp to expose Vargos bus events as tools');

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
