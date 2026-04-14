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
