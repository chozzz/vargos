/**
 * Vargos MCP Server
 * Entry point with configurable service backends and Pi agent runtime
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { toolRegistry } from './mcp/tools/index.js';
import { ToolContext } from './mcp/tools/types.js';
import { initializeServices, ServiceConfig } from './services/factory.js';
import { initializePiAgentRuntime } from './pi/runtime.js';
import { isSubagentSessionKey } from './agent/prompt.js';

/**
 * Load context files (AGENTS.md, TOOLS.md, etc.)
 * Like OpenClaw's bootstrap context files
 */
async function loadContextFiles(workspaceDir: string): Promise<Array<{ name: string; content: string }>> {
  const files: Array<{ name: string; content: string }> = [];
  
  const contextFiles = [
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'HEARTBEAT.md',
    'BOOTSTRAP.md',
    'MEMORY.md',
  ];

  for (const filename of contextFiles) {
    try {
      const filePath = path.join(workspaceDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      files.push({ name: filename, content });
    } catch {
      // File doesn't exist, skip
    }
  }

  return files;
}

async function main() {
  // Load service configuration from environment
  const serviceConfig: ServiceConfig = {
    memory: (process.env.VARGOS_MEMORY_BACKEND as 'file' | 'qdrant' | 'postgres') ?? 'file',
    sessions: (process.env.VARGOS_SESSIONS_BACKEND as 'file' | 'postgres') ?? 'file',
    fileMemoryDir: process.env.VARGOS_MEMORY_DIR,
    qdrantUrl: process.env.QDRANT_URL,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    postgresUrl: process.env.POSTGRES_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
  };

  const workspaceDir = process.env.VARGOS_WORKSPACE ?? process.cwd();

  // Initialize services
  console.error('Initializing services...');
  console.error(`  Memory: ${serviceConfig.memory}`);
  console.error(`  Sessions: ${serviceConfig.sessions}`);
  console.error(`  Workspace: ${workspaceDir}`);
  
  try {
    await initializeServices(serviceConfig);
    initializePiAgentRuntime();
    console.error('Services initialized successfully');
  } catch (err) {
    console.error('Failed to initialize services:', err);
    process.exit(1);
  }

  // Load context files
  const contextFiles = await loadContextFiles(workspaceDir);
  console.error(`  Context files: ${contextFiles.map(f => f.name).join(', ') || 'none'}`);

  // Create MCP server
  const server = new Server(
    {
      name: 'vargos',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = toolRegistry.list();
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.parameters),
      })),
    };
  });

  // Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const tool = toolRegistry.get(name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Determine session key (could be passed in args or use default)
    const sessionKey = (args as Record<string, unknown>)?.sessionKey as string || 'default';

    const context: ToolContext = {
      sessionKey,
      workingDir: workspaceDir,
    };

    // Filter tools for subagents
    if (isSubagentSessionKey(sessionKey)) {
      const deniedTools = ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'];
      if (deniedTools.includes(name)) {
        return {
          content: [{ type: 'text', text: `Tool '${name}' is not available to subagents.` }],
          isError: true,
        };
      }
    }

    try {
      const result = await tool.execute(args, context);
      return { content: result.content, isError: result.isError };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Vargos MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
