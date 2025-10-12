/**
 * Vargos MCP Server
 * Entry point with configurable service backends, Pi agent runtime, and interactive config
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
import os from 'node:os';
import { toolRegistry } from './mcp/tools/index.js';
import { ToolContext } from './mcp/tools/types.js';
import { initializeServices, ServiceConfig } from './services/factory.js';
import { initializePiAgentRuntime } from './pi/runtime.js';
import { isSubagentSessionKey } from './agent/prompt.js';
import { interactiveConfig, printStartupBanner, checkConfig } from './config/interactive.js';
import { initializeWorkspace, isWorkspaceInitialized } from './config/workspace.js';
import { isPiConfigured, formatPiConfigDisplay, listPiProviders, loadPiSettings } from './config/pi-config.js';

const VERSION = '0.0.1';

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

/**
 * Check if running in a TTY (interactive terminal)
 */
function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}

async function main() {
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
  const workspaceDir = process.env.VARGOS_WORKSPACE ?? path.join(os.homedir(), '.vargos', 'workspace');
  
  // Initialize workspace if needed
  const workspaceExists = await isWorkspaceInitialized(workspaceDir);
  if (!workspaceExists) {
    console.error('📁 Initializing workspace...');
    await initializeWorkspace({ workspaceDir });
    console.error('  ✓ Created default workspace files');
  }
  
  const serviceConfig: ServiceConfig = {
    memory: (process.env.VARGOS_MEMORY_BACKEND as 'file' | 'qdrant' | 'postgres') ?? 'file',
    sessions: (process.env.VARGOS_SESSIONS_BACKEND as 'file' | 'postgres') ?? 'file',
    fileMemoryDir: process.env.VARGOS_MEMORY_DIR,
    qdrantUrl: process.env.QDRANT_URL,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    postgresUrl: process.env.POSTGRES_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
  };

  // Load context files
  const contextFiles = await loadContextFiles(workspaceDir);
  const contextFileNames = contextFiles.map(f => f.name);

  // Load Pi agent configuration
  const piStatus = await isPiConfigured(workspaceDir);
  const piProviders = await listPiProviders(workspaceDir);
  const piSettings = await loadPiSettings(workspaceDir);

  // Print startup banner
  printStartupBanner({
    mode: 'mcp',
    version: VERSION,
    workspace: workspaceDir,
    memoryBackend: (serviceConfig.memory as string) || 'file',
    sessionsBackend: (serviceConfig.sessions as string) || 'file',
    contextFiles: contextFileNames.length > 0 ? contextFileNames : ['(none)'],
    toolsCount: toolRegistry.list().length,
    transport: 'stdio',
  });

  // Print Pi agent configuration
  console.error(formatPiConfigDisplay({
    provider: piSettings.defaultProvider,
    model: piSettings.defaultModel,
    apiKeys: piProviders,
  }));
  console.error('');

  // Initialize services
  console.error('🔌 Initializing services...');
  
  try {
    await initializeServices(serviceConfig);
    console.error('  ✓ MemoryContext initialized');
    
    initializePiAgentRuntime();
    console.error('  ✓ PiAgentRuntime initialized');
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

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.error('\n👋 Shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('\n👋 Shutting down...');
    process.exit(0);
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('📡 MCP server connected (stdio)');
  console.error('');
}

main().catch((err) => {
  console.error('');
  console.error('❌ Fatal error:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(1);
});
