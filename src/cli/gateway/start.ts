import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { GatewayServer } from '../../gateway/server.js';
import { ToolsService } from '../../services/tools/index.js';
import { SessionsService } from '../../services/sessions/index.js';
import { CronService } from '../../services/cron/index.js';
import { ChannelService } from '../../services/channels/index.js';
import type { ChannelType } from '../../core/channels/types.js';
import { AgentService } from '../../services/agent/index.js';
import { McpBridge } from '../../mcp/server.js';
import { toolRegistry } from '../../core/tools/registry.js';
import { FileSessionService } from '../../extensions/service-file/sessions-file.js';
import { setSessionService } from '../../core/services/factory.js';
import { initializeMemoryContext, getMemoryContext } from '../../extensions/service-file/memory-context.js';
import { resolveDataDir, resolveWorkspaceDir, initPaths } from '../../core/config/paths.js';
import { loadConfig, syncPiSdkFiles } from '../../core/config/pi-config.js';
import { validateConfig, checkLocalProvider } from '../../core/config/validate.js';
import { initializeWorkspace, isWorkspaceInitialized } from '../../core/config/workspace.js';
import { checkIdentitySetup } from '../../core/config/identity.js';
import type { ExtensionContext } from '../../core/extensions.js';
import { setGatewayCall } from '../../core/runtime/extension.js';
import {
  renderBanner,
  renderServices,
  renderMcp,
  renderReady,
  renderNextSteps,
  type ServiceStatus,
} from '../banner.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../../package.json');

async function acquireProcessLock(): Promise<boolean> {
  const pidFile = path.join(resolveDataDir(), 'vargos.pid');
  try { await fs.mkdir(path.dirname(pidFile), { recursive: true }); } catch { /* exists */ }

  try {
    const existing = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
    if (existing && existing !== process.pid) {
      try { process.kill(existing, 0); return false; } catch { /* stale lock */ }
    }
  } catch { /* no lock file */ }

  await fs.writeFile(pidFile, String(process.pid));
  return true;
}

async function releaseProcessLock(): Promise<void> {
  try { await fs.unlink(path.join(resolveDataDir(), 'vargos.pid')); } catch { /* gone */ }
}

// Tool groups for display — maps extension module to label
const TOOL_GROUPS = ['fs', 'web', 'agent', 'memory'] as const;

export async function start(): Promise<void> {
  const bootStart = Date.now();
  const log = (s: string) => console.error(s);
  const dataDir = resolveDataDir();
  const workspaceDir = resolveWorkspaceDir();

  // ── PID lock ──────────────────────────────────────────────────────────────
  if (!(await acquireProcessLock())) {
    const pidFile = path.join(dataDir, 'vargos.pid');
    const pid = await fs.readFile(pidFile, 'utf-8').catch(() => '?');
    log(`\n  Another instance running (PID: ${pid}) — exiting.\n`);
    process.exit(1);
  }

  // ── Config ────────────────────────────────────────────────────────────────
  if (!(await isWorkspaceInitialized(workspaceDir))) {
    await initializeWorkspace({ workspaceDir });
  }
  await checkIdentitySetup(workspaceDir);

  let config = await loadConfig(dataDir);
  if (!config) {
    if (process.stdin.isTTY) {
      const { interactivePiConfig } = await import('../../core/config/onboard.js');
      await interactivePiConfig(dataDir);
      config = await loadConfig(dataDir);
    }
    if (!config) {
      log('  No config found. Run: vargos config');
      process.exit(1);
    }
  }

  const validation = validateConfig(config);
  for (const w of validation.warnings) log(`  ⚠ ${w}`);
  if (!validation.valid) {
    for (const e of validation.errors) log(`  ✗ ${e}`);
    process.exit(1);
  }

  const connectErr = await checkLocalProvider(config.agent.provider, config.agent.baseUrl);
  if (connectErr) {
    log(`  ✗ ${connectErr}`);
    process.exit(1);
  }

  initPaths(config.paths);
  await syncPiSdkFiles(workspaceDir, config.agent);

  // ── Banner ────────────────────────────────────────────────────────────────
  renderBanner({
    version: VERSION,
    agent: config.agent,
    dataDir,
  });

  // ── Gateway ───────────────────────────────────────────────────────────────
  const gatewayPort = config.gateway?.port ?? 9000;
  const gatewayHost = config.gateway?.host ?? '127.0.0.1';
  const gatewayUrl = `ws://${gatewayHost}:${gatewayPort}`;

  const gateway = new GatewayServer({ port: gatewayPort, host: gatewayHost });
  await gateway.start();

  const services: ServiceStatus[] = [];
  services.push({ name: 'Gateway', ok: true, detail: gatewayUrl });

  // ── Sessions service ──────────────────────────────────────────────────────
  const fileSessionService = new FileSessionService({ baseDir: dataDir });
  setSessionService(fileSessionService);
  const sessions = new SessionsService({ sessionService: fileSessionService, gatewayUrl });
  await sessions.initialize();
  await sessions.connect();
  services.push({ name: 'Sessions', ok: true });

  // ── Memory context ────────────────────────────────────────────────────────
  const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
  const apiKey = envKey || config.agent.apiKey;
  await initializeMemoryContext({
    memoryDir: workspaceDir,
    cacheDir: path.join(dataDir, 'cache'),
    embeddingProvider: apiKey && config.agent.provider === 'openai' ? 'openai' : 'none',
    openaiApiKey: apiKey,
    chunkSize: 400,
    chunkOverlap: 80,
    hybridWeight: { vector: 0.7, text: 0.3 },
    sqlite: { dbPath: path.join(dataDir, 'memory.db') },
    sessionsDir: path.join(dataDir, 'sessions'),
    enableFileWatcher: process.env.NODE_ENV === 'development',
  });
  services.push({ name: 'Memory', ok: true });

  // ── Tools service ─────────────────────────────────────────────────────────
  const extensionCtx: ExtensionContext = {
    registerTool: (tool) => toolRegistry.register(tool),
    registerChannel: () => {},
    registerGatewayPlugin: () => {},
    registerMemoryService: () => {},
    registerSessionService: () => {},
    registerCronTask: () => {},
    getServices: () => { throw new Error('Use gateway RPC'); },
    getRuntime: () => { throw new Error('Use gateway RPC'); },
    paths: { dataDir, workspaceDir },
  };

  // Track tool count per extension group
  const toolCounts: Record<string, number> = {};
  const extensionModules = await Promise.all([
    import('../../extensions/tools-fs/index.js'),
    import('../../extensions/tools-web/index.js'),
    import('../../extensions/tools-agent/index.js'),
    import('../../extensions/tools-memory/index.js'),
  ]);
  for (let i = 0; i < extensionModules.length; i++) {
    const before = toolRegistry.list().length;
    await extensionModules[i].default.register(extensionCtx);
    toolCounts[TOOL_GROUPS[i]] = toolRegistry.list().length - before;
  }

  const tools = new ToolsService({ registry: toolRegistry, gatewayUrl });
  await tools.connect();
  setGatewayCall((target, method, params) => tools.call(target, method, params));

  const totalTools = toolRegistry.list().length;
  const groupSummary = TOOL_GROUPS
    .filter(g => toolCounts[g] > 0)
    .map(g => `${g}: ${toolCounts[g]}`)
    .join(', ');
  services.push({ name: 'Tools', ok: true, detail: `${totalTools} (${groupSummary})` });

  // ── Cron service ──────────────────────────────────────────────────────────
  const cron = new CronService({ gatewayUrl });
  await cron.connect();
  const { createTwiceDailyVargosAnalysis } = await import('../../extensions/cron/tasks/vargos-analysis.js');
  createTwiceDailyVargosAnalysis(cron);
  cron.startAll();
  const cronCount = cron.listTasks().length;
  services.push({ name: 'Cron', ok: true, detail: `${cronCount} task${cronCount !== 1 ? 's' : ''}` });

  // ── Channel service ───────────────────────────────────────────────────────
  const channels = new ChannelService({ gatewayUrl });
  await channels.connect();

  if (config.channels) {
    const { createAdapter } = await import('../../core/channels/factory.js');
    for (const [type, chConfig] of Object.entries(config.channels)) {
      if (chConfig.enabled === false) continue;
      try {
        const adapter = createAdapter({ type: type as ChannelType, enabled: true, ...chConfig });
        await channels.addAdapter(adapter);
        await adapter.initialize();
        await adapter.start();
        services.push({ name: 'Channel', ok: true, detail: `${type} ${adapter.status}` });
      } catch (err) {
        services.push({ name: 'Channel', ok: false, detail: `${type} (${err instanceof Error ? err.message : String(err)})` });
      }
    }
  }

  // ── Agent service ─────────────────────────────────────────────────────────
  const agent = new AgentService({ gatewayUrl, workspaceDir, dataDir });
  await agent.connect();
  services.push({ name: 'Agent', ok: true });

  // ── MCP bridge ────────────────────────────────────────────────────────────
  const mcpBridge = new McpBridge({ gatewayUrl, version: VERSION });
  await mcpBridge.connect();

  let mcpUrl = 'stdio';
  const mcpTransport = config.mcp?.transport ?? 'http';
  if (mcpTransport === 'http') {
    const mcpHost = config.mcp?.host ?? '127.0.0.1';
    const mcpPort = config.mcp?.port ?? 9001;
    const mcpEndpoint = config.mcp?.endpoint ?? '/mcp';
    await mcpBridge.startHttp({ host: mcpHost, port: mcpPort, endpoint: mcpEndpoint });
    mcpUrl = `http://${mcpHost}:${mcpPort}${mcpEndpoint}`;
  } else {
    await mcpBridge.startStdio();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  renderServices(services);
  renderMcp(mcpUrl);
  renderReady({
    services: gateway.registry.list().length,
    tools: totalTools,
    bootMs: Date.now() - bootStart,
  });
  renderNextSteps();

  // ── Shutdown ──────────────────────────────────────────────────────────────
  const teardown = async () => {
    await mcpBridge.stopHttp().catch(() => {});
    await mcpBridge.disconnect();
    await agent.disconnect();
    await channels.stopAdapters();
    await channels.disconnect();
    cron.stopAll();
    await cron.disconnect();
    await tools.disconnect();
    await sessions.disconnect();
    await getMemoryContext().close().catch(() => {});
    await gateway.stop();
  };

  const shutdown = async () => {
    log('\n  Shutting down...');
    await teardown();
    await releaseProcessLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('SIGUSR2', async () => {
    log('\n  Restarting...');
    await teardown();
    await releaseProcessLock();
    const { spawn } = await import('node:child_process');
    spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    }).unref();
    process.exit(0);
  });
}
