/**
 * Vargos MCP Server
 * Supports both stdio and HTTP transports
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { toolRegistry } from './tools/index.js';
import { ToolContext } from './tools/types.js';
import { isSubagentSessionKey, isToolAllowedForSubagent, formatErrorResult } from './lib/errors.js';
import { resolveDataDir } from './config/paths.js';
import { boot, startBackgroundServices, shutdown, acquireProcessLock, releaseProcessLock } from './boot.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

function getServerConfig() {
  return {
    transport: (process.env.VARGOS_TRANSPORT as 'stdio' | 'http') ?? 'stdio',
    host: process.env.VARGOS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.VARGOS_PORT ?? '3000', 10),
    endpoint: process.env.VARGOS_ENDPOINT ?? '/mcp',
  };
}

async function startStdioServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttpServer(
  server: Server,
  config: { host: string; port: number; endpoint: string }
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (!req.url?.startsWith(config.endpoint)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

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
    httpServer.listen(config.port, config.host, () => resolve());

    const onShutdown = () => {
      releaseProcessLock();
      httpServer.close(() => process.exit(0));
    };
    process.on('SIGINT', onShutdown);
    process.on('SIGTERM', onShutdown);
  });
}

async function main() {
  if (!(await acquireProcessLock())) {
    const pidFile = path.join(resolveDataDir(), 'vargos.pid');
    const pid = await fs.readFile(pidFile, 'utf-8').catch(() => '?');
    console.error(`Another vargos instance is already running (PID: ${pid}) — exiting.`);
    process.exit(1);
  }

  const serverConfig = getServerConfig();

  const { workspaceDir } = await boot();

  await startBackgroundServices(workspaceDir);

  // Create MCP server
  const server = new Server(
    { name: 'vargos', version: VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolRegistry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.parameters),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const tool = toolRegistry.get(name);

    if (!tool) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    const sessionKey = (args as Record<string, unknown>)?.sessionKey as string || 'default';
    const context: ToolContext = { sessionKey, workingDir: workspaceDir };

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

  if (serverConfig.transport === 'http') {
    await startHttpServer(server, serverConfig);
    console.error(`  Listening on http://${serverConfig.host}:${serverConfig.port}${serverConfig.endpoint}`);
    console.error('');
  } else {
    await startStdioServer(server);
    console.error('  Listening on stdio');
    console.error('');

    const onShutdown = async () => {
      console.error('\n Shutting down...');
      await shutdown();
      process.exit(0);
    };
    process.on('SIGINT', onShutdown);
    process.on('SIGTERM', onShutdown);
  }
}

main().catch((err) => {
  console.error('');
  console.error('Fatal error:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(1);
});
