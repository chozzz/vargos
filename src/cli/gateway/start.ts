import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { GatewayServer } from '../../gateway/server.js';
import { ToolsService } from '../../client/tools/index.js';
import { SessionsService } from '../../client/sessions/index.js';
import { CronService } from '../../client/cron/index.js';
import { ChannelService } from '../../client/channels/index.js';
import type { ChannelType } from '../../contracts/channel.js';
import { AgentService } from '../../client/agent/index.js';
import { McpBridge } from '../../mcp/server.js';
import { toolRegistry } from '../../tools/registry.js';
import { FileSessionService } from '../../extensions/service-file/sessions-file.js';
import { PiAgentRuntime } from '../../runtime/runtime.js';
import { initializeMemoryContext, getMemoryContext } from '../../extensions/service-file/memory-context.js';
import { resolveDataDir, resolveWorkspaceDir, resolveCacheDir, initPaths } from '../../config/paths.js';
import type { MemoryStorage } from '../../extensions/service-file/storage.js';
import { loadConfig } from '../../config/pi-config.js';
import { validateConfig, checkLocalProvider } from '../../config/validate.js';
import { initializeWorkspace, isWorkspaceInitialized } from '../../config/workspace.js';
import type { ExtensionContext } from '../../contracts/extension.js';
import { setGatewayCall } from '../../runtime/extension.js';
import { acquireLock, releaseLock } from '../lock.js';
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

/** Local PID file for stop/restart commands on the same machine */
async function writePidFile(dataDir: string): Promise<void> {
  await fs.writeFile(path.join(dataDir, 'vargos.pid'), String(process.pid));
}

async function removePidFile(dataDir: string): Promise<void> {
  try { await fs.unlink(path.join(dataDir, 'vargos.pid')); } catch { /* gone */ }
}

// Tool groups for display — maps extension module to label
const TOOL_GROUPS = ['fs', 'web', 'agent', 'memory'] as const;

export async function start(): Promise<void> {
  const bootStart = Date.now();
  const log = (s: string) => console.error(s);
  const dataDir = resolveDataDir();
  const workspaceDir = resolveWorkspaceDir();

  // ── Gateway lock ─────────────────────────────────────────────────────────
  const lockHolder = await acquireLock(dataDir);
  if (lockHolder) {
    log(`\n  Another instance running (host: ${lockHolder.host}, PID: ${lockHolder.pid}) — exiting.\n`);
    process.exit(1);
  }
  await writePidFile(dataDir);

  // ── Config ────────────────────────────────────────────────────────────────
  if (!(await isWorkspaceInitialized(workspaceDir))) {
    await initializeWorkspace({ workspaceDir });
  }

  let config = await loadConfig(dataDir);
  if (!config && process.stdin.isTTY) {
    const { runFirstRunSetup } = await import('../../config/onboard.js');
    await runFirstRunSetup(dataDir, workspaceDir);
    config = await loadConfig(dataDir);
  }
  if (config && !config.storage && process.stdin.isTTY) {
    const { setupStorage } = await import('../../config/onboard.js');
    await setupStorage(dataDir);
    config = await loadConfig(dataDir);
  }
  if (!config) {
    log('  No config found. Run: vargos config');
    process.exit(1);
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

  const gateway = new GatewayServer({ port: gatewayPort, host: gatewayHost, requestTimeout: 300_000 });
  await gateway.start();

  const services: ServiceStatus[] = [];
  services.push({ name: 'Gateway', ok: true, detail: gatewayUrl });

  // ── Sessions service ──────────────────────────────────────────────────────
  const fileSessionService = new FileSessionService({ baseDir: dataDir });
  const sessions = new SessionsService({ sessionService: fileSessionService, gatewayUrl });
  await sessions.initialize();
  await sessions.connect();
  services.push({ name: 'Sessions', ok: true });

  // ── Memory context ────────────────────────────────────────────────────────
  const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
  const apiKey = envKey || config.agent.apiKey;

  let memoryStorage: MemoryStorage;
  const storageType = config.storage?.type ?? 'postgres';
  if (storageType === 'postgres' && config.storage?.url) {
    const { MemoryPostgresStorage } = await import('../../extensions/service-file/postgres-storage.js');
    memoryStorage = new MemoryPostgresStorage({ url: config.storage.url });
  } else {
    const { MemorySQLiteStorage } = await import('../../extensions/service-file/sqlite-storage.js');
    memoryStorage = new MemorySQLiteStorage({ dbPath: path.join(resolveCacheDir(), 'memory.db') });
  }

  await initializeMemoryContext({
    memoryDir: workspaceDir,
    cacheDir: path.join(dataDir, 'cache'),
    embeddingProvider: apiKey && config.agent.provider === 'openai' ? 'openai' : 'none',
    openaiApiKey: apiKey,
    chunkSize: 400,
    chunkOverlap: 80,
    hybridWeight: { vector: 0.7, text: 0.3 },
    storage: memoryStorage,
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
    const { createAdapter } = await import('../../channels/factory.js');
    const gatewayCall = <T = unknown>(target: string, method: string, params?: unknown) =>
      tools.call<T>(target, method, params);
    for (const [type, chConfig] of Object.entries(config.channels)) {
      if (chConfig.enabled === false) continue;
      try {
        const adapter = createAdapter({ type: type as ChannelType, enabled: true, ...chConfig }, gatewayCall);
        await channels.addAdapter(adapter);
        await adapter.initialize();
        await adapter.start();
        // Wait for adapter to leave 'connecting' (up to 3s)
        if (adapter.status === 'connecting') {
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (done) return; done = true; clearInterval(poll); clearTimeout(deadline); resolve(); };
            const poll = setInterval(() => { if (adapter.status !== 'connecting') finish(); }, 200);
            const deadline = setTimeout(finish, 3000);
          });
        }
        services.push({ name: 'Channel', ok: true, detail: `${type} ${adapter.status}` });
      } catch (err) {
        services.push({ name: 'Channel', ok: false, detail: `${type} (${err instanceof Error ? err.message : String(err)})` });
      }
    }
  }

  // ── Agent service ─────────────────────────────────────────────────────────
  const runtime = new PiAgentRuntime({ sessionService: fileSessionService });
  const agent = new AgentService({ gatewayUrl, workspaceDir, dataDir, runtime });
  await agent.connect();
  services.push({ name: 'Agent', ok: true });

  // ── Heartbeat (optional) ────────────────────────────────────────────────
  if (config.heartbeat?.enabled) {
    const { createHeartbeatTask } = await import('../../extensions/cron/tasks/heartbeat.js');
    createHeartbeatTask(cron, config.heartbeat, workspaceDir, () => runtime.listActiveRuns().length);
    const updatedCronCount = cron.listTasks().length;
    // Update cron service status detail
    const cronStatus = services.find(s => s.name === 'Cron');
    if (cronStatus) cronStatus.detail = `${updatedCronCount} task${updatedCronCount !== 1 ? 's' : ''}`;
  }

  // ── MCP bridge ────────────────────────────────────────────────────────────
  const mcpBridge = new McpBridge({ gatewayUrl, version: VERSION });
  await mcpBridge.connect();

  let mcpUrl = 'stdio';
  let openapiUrl: string | undefined;
  const mcpTransport = config.mcp?.transport ?? 'http';
  if (mcpTransport === 'http') {
    const mcpHost = config.mcp?.host ?? '127.0.0.1';
    const mcpPort = config.mcp?.port ?? 9001;
    const mcpEndpoint = config.mcp?.endpoint ?? '/mcp';
    await mcpBridge.startHttp({ host: mcpHost, port: mcpPort, endpoint: mcpEndpoint });
    mcpUrl = `http://${mcpHost}:${mcpPort}${mcpEndpoint}`;
    openapiUrl = `http://${mcpHost}:${mcpPort}/openapi.json`;
  } else {
    await mcpBridge.startStdio();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  renderServices(services);
  renderMcp(mcpUrl, openapiUrl);
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
    await removePidFile(dataDir);
    await releaseLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('SIGUSR2', async () => {
    log('\n  Restarting...');
    await teardown();
    await removePidFile(dataDir);
    await releaseLock();
    const { spawn } = await import('node:child_process');
    spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    }).unref();
    process.exit(0);
  });
}
