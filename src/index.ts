/**
 * Vargos MCP Server
 * Entry point with configurable service backends, Pi agent runtime, and transport options
 * Supports both stdio and HTTP transports
 */

import 'dotenv/config';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import path from 'node:path';
import http from 'node:http';
import { toolRegistry, initializeToolRegistry } from './mcp/tools/index.js';
import { ToolContext } from './mcp/tools/types.js';
import { initializeServices, ServiceConfig } from './services/factory.js';
import { initializePiAgentRuntime } from './pi/runtime.js';
import { isSubagentSessionKey, isToolAllowedForSubagent, formatErrorResult } from './utils/errors.js';
import { interactiveConfig, printStartupBanner, checkConfig } from './config/interactive.js';
import { initializeWorkspace, isWorkspaceInitialized, loadContextFiles } from './config/workspace.js';
import { resolveDataDir, resolveWorkspaceDir } from './config/paths.js';

const VERSION = '0.0.1';

/**
 * Check if running in a TTY (interactive terminal)
 */
function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}

/**
 * Get server configuration from environment
 */
function getServerConfig(): {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  endpoint: string;
} {
  const transport = (process.env.VARGOS_TRANSPORT as 'stdio' | 'http') ?? 'stdio';
  const host = process.env.VARGOS_HOST ?? '127.0.0.1';
  const port = parseInt(process.env.VARGOS_PORT ?? '3000', 10);
  const endpoint = process.env.VARGOS_ENDPOINT ?? '/mcp';

  return { transport, host, port, endpoint };
}

/**
 * Start MCP server with stdio transport
 */
async function startStdioServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Start MCP server with HTTP transport
 */
async function startHttpServer(
  server: Server,
  config: { host: string; port: number; endpoint: string }
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle requests to the MCP endpoint
    if (!req.url?.startsWith(config.endpoint)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Handle the request
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('HTTP error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(config.port, config.host, () => {
      resolve();
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.error('\n👋 Shutting down HTTP server...');
      httpServer.close(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      console.error('\n👋 Shutting down HTTP server...');
      httpServer.close(() => process.exit(0));
    });
  });
}

async function main() {
  // Get server configuration early
  const serverConfig = getServerConfig();

  // Check configuration
  const { valid: configValid, missing } = checkConfig();

  // If config invalid and interactive, prompt for missing values
  if (!configValid && isInteractive()) {
    await interactiveConfig();
  } else if (!configValid) {
    // Non-interactive mode with missing config - fail fast
    console.error('');
    console.error('❌ Configuration Error');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Missing required configuration:');
    for (const config of missing) {
      console.error(`  • ${config.key}: ${config.why}`);
    }
    console.error('');
    console.error('Set these environment variables or run interactively.');
    console.error('');
    process.exit(1);
  }

  // Load service configuration from environment
  const workspaceDir = resolveWorkspaceDir();

  // Initialize workspace if needed
  const workspaceExists = await isWorkspaceInitialized(workspaceDir);
  if (!workspaceExists) {
    console.error('📁 Initializing workspace...');
    await initializeWorkspace({ workspaceDir });
    console.error('  ✓ Created default workspace files');
  }

  const dataDir = resolveDataDir();
  const serviceConfig: ServiceConfig = {
    memory: (process.env.VARGOS_MEMORY_BACKEND as 'file' | 'qdrant' | 'postgres') ?? 'file',
    sessions: (process.env.VARGOS_SESSIONS_BACKEND as 'file' | 'postgres') ?? 'file',
    fileMemoryDir: dataDir,
    qdrantUrl: process.env.QDRANT_URL,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    postgresUrl: process.env.POSTGRES_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    workspaceDir, // For memory indexing of .md files
  };

  // Register tools (dynamic imports to avoid circular deps)
  await initializeToolRegistry();

  // Load context files
  const contextFiles = await loadContextFiles(workspaceDir);
  const contextFilesWithPaths = contextFiles.map(f => ({
    name: f.name,
    path: path.join(workspaceDir, f.name)
  }));

  // Get tools with descriptions
  const tools = toolRegistry.list().map(t => ({
    name: t.name,
    description: t.description
  }));

  // Print startup banner
  printStartupBanner({
    mode: 'mcp',
    version: VERSION,
    workspace: workspaceDir,
    dataDir,
    memoryBackend: (serviceConfig.memory as string) || 'file',
    sessionsBackend: (serviceConfig.sessions as string) || 'file',
    contextFiles: contextFilesWithPaths,
    tools,
    transport: serverConfig.transport,
    host: serverConfig.host,
    port: serverConfig.port,
    endpoint: serverConfig.endpoint,
  });

  // Initialize services
  console.error('  Services');

  try {
    await initializeServices(serviceConfig);
    console.error('    Memory     ok');

    initializePiAgentRuntime();
    console.error('    Runtime    ok');
  } catch (err) {
    console.error('');
    console.error('❌ Service initialization failed:');
    console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    console.error('');

    if (serviceConfig.memory === 'qdrant') {
      console.error('💡 Is Qdrant running? Start with:');
      console.error('   docker run -p 6333:6333 qdrant/qdrant');
    }
    if (serviceConfig.sessions === 'postgres') {
      console.error('💡 Is PostgreSQL running? Check your POSTGRES_URL.');
    }

    console.error('');
    process.exit(1);
  }

  // Load and start channel adapters
  const { loadChannelConfigs } = await import('./channels/config.js');
  const { createAdapter } = await import('./channels/factory.js');
  const { getChannelRegistry } = await import('./channels/registry.js');

  const channelConfigs = await loadChannelConfigs();
  const enabledChannels = channelConfigs.filter((c) => c.enabled);
  const channelRegistry = getChannelRegistry();

  if (enabledChannels.length > 0) {
    console.error('  Channels');
    for (const cfg of enabledChannels) {
      try {
        const adapter = createAdapter(cfg);
        channelRegistry.register(adapter);
        await adapter.initialize();
        await adapter.start();
        console.error(`    ${cfg.type.padEnd(10)}${adapter.status}`);
      } catch (err) {
        console.error(`    ${cfg.type.padEnd(10)}failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  console.error('');

  // Create MCP server
  const server = new Server(
    {
      name: 'vargos',
      version: VERSION,
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
    if (isSubagentSessionKey(sessionKey) && !isToolAllowedForSubagent(name)) {
      const error = formatErrorResult(`Tool '${name}' is not available to subagents.`);
      return { content: error.content, isError: true };
    }

    try {
      const result = await tool.execute(args, context);
      return { content: result.content, isError: result.isError };
    } catch (err) {
      const error = formatErrorResult(err);
      return { content: error.content, isError: true };
    }
  });

  // Start server with appropriate transport
  if (serverConfig.transport === 'http') {
    await startHttpServer(server, serverConfig);
    console.error(`  Listening on http://${serverConfig.host}:${serverConfig.port}${serverConfig.endpoint}`);
    console.error('');
  } else {
    await startStdioServer(server);
    console.error('  Listening on stdio');
    console.error('');

    // Handle graceful shutdown for stdio
    process.on('SIGINT', async () => {
      console.error('\n Shutting down...');
      await channelRegistry.stopAll();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('\n Shutting down...');
      await channelRegistry.stopAll();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('');
  console.error('❌ Fatal error:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(1);
});
