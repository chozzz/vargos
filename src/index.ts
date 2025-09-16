/**
 * Vargos MCP Server
 * Entry point with configurable service backends
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toolRegistry } from './mcp/tools/index.js';
import { ToolContext } from './mcp/tools/types.js';
import { initializeServices, ServiceConfig } from './services/factory.js';

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

  // Initialize services
  console.error('Initializing services...');
  console.error(`  Memory: ${serviceConfig.memory}`);
  console.error(`  Sessions: ${serviceConfig.sessions}`);
  
  try {
    await initializeServices(serviceConfig);
    console.error('Services initialized successfully');
  } catch (err) {
    console.error('Failed to initialize services:', err);
    process.exit(1);
  }

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
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolRegistry.get(name);

    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const context: ToolContext = {
      sessionKey: 'default',
      workingDir: process.cwd(),
    };

    try {
      const result = await tool.execute(args, context);
      return result;
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
