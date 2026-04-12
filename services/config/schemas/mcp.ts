/**
 * MCP (Model Context Protocol) configuration schemas
 */

import { z } from 'zod';

// ─── MCP client (HTTP bridge) ─────────────────────────────────────────────────

export const McpClientConfigSchema = z.object({
  bearerToken: z.string().optional(),
  host:        z.string().optional(),
  port:        z.number().int().min(1).max(65535).optional(),
  endpoint:    z.string().optional(),
  transport:   z.enum(['http', 'stdio']).optional(),
});

export type McpClientConfig = z.infer<typeof McpClientConfigSchema>;

// ─── External MCP servers (agent / tooling; preserved for docs & future wiring) ─

export const McpServerEntrySchema = z.object({
  command: z.string(),
  args:    z.array(z.string()).optional(),
  env:     z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export const McpServersConfigSchema = z.record(z.string(), McpServerEntrySchema);

export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;
