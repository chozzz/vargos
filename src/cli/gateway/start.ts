import path from 'node:path';
import { createRequire } from 'node:module';
import { GatewayServer } from '../../gateway/server.js';
import { ToolsService } from '../../tools/service.js';
import { SessionsService } from '../../sessions/service.js';
import { CronService } from '../../cron/service.js';
import { ChannelService } from '../../channels/service.js';
import type { ChannelType, OnInboundMessageFn } from '../../channels/types.js';
import { AgentService } from '../../agent/service.js';
import { McpBridge } from '../../mcp/server.js';
import { toolRegistry } from '../../tools/registry.js';
import { FileSessionService } from '../../sessions/file-store.js';
import { PiAgentRuntime } from '../../agent/runtime.js';
import { initializeMemoryContext, getMemoryContext } from '../../memory/context.js';
import { resolveDataDir, resolveWorkspaceDir, resolveCacheDir, resolveGatewayUrl, initPaths } from '../../config/paths.js';
import type { MemoryStorage } from '../../memory/types.js';
import { loadConfig, saveConfig } from '../../config/pi-config.js';
import type { VargosConfig } from '../../config/pi-config.js';
import { validateConfig, checkLocalProvider } from '../../config/validate.js';
import { initializeWorkspace, isWorkspaceInitialized } from '../../config/workspace.js';
import type { ExtensionContext } from '../../tools/extension.js';
import { setGatewayCall } from '../../agent/extension.js';
import { extractLoaderArgs } from '../../lib/loader-args.js';
import { acquireLock, releaseLock } from '../lock.js';
import { writePidFile, removePidFile } from '../pid.js';
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

const TOOL_GROUPS = ['fs', 'web', 'agent', 'memory'] as const;

const DEFAULT_CRON_TASKS = [
  {
    id: 'vargos-morning-analysis',
    name: 'Vargos Morning Analysis (AEST)',
    schedule: '0 23 * * *',
    task: 'Analyze the Vargos codebase for improvements. Review scalability, code quality, architecture patterns, and feature gaps. Present suggestions with effort/impact ratings. Store findings in memory/vargos-suggestions/. Wait for user approval before implementing.',
  },
  {
    id: 'vargos-evening-analysis',
    name: 'Vargos Evening Analysis (AEST)',
    schedule: '0 11 * * *',
    task: 'Analyze the Vargos codebase for improvements. Review scalability, code quality, architecture patterns, and feature gaps. Present suggestions with effort/impact ratings. Store findings in memory/vargos-suggestions/. Wait for user approval before implementing.',
  },
];

interface BootedServices {
  gateway: GatewayServer;
  sessions: SessionsService;
  tools: ToolsService;
  cron: CronService;
  agent: AgentService;
  channels: ChannelService;
  mcpBridge: McpBridge;
  mcpClients: import('../../mcp/client.js').McpClientManager;
  webhooks?: import('../../webhooks/service.js').WebhookService;
}

async function resolveMemoryStorage(config: VargosConfig, dataDir: string): Promise<MemoryStorage> {
  const storageType = config.storage?.type ?? 'postgres';
  if (storageType === 'postgres' && config.storage?.url) {
    const { MemoryPostgresStorage } = await import('../../memory/postgres-storage.js');
    return new MemoryPostgresStorage({ url: config.storage.url });
  }
  const { MemorySQLiteStorage } = await import('../../memory/sqlite-storage.js');
  return new MemorySQLiteStorage({ dbPath: path.join(resolveCacheDir(), 'memory.db') });
}

async function initTools(
  extensionCtx: ExtensionContext,
  gatewayUrl: string,
): Promise<{ tools: ToolsService; toolCounts: Record<string, number> }> {
  const toolCounts: Record<string, number> = {};
  const extensionModules = await Promise.all([
    import('../../tools/fs/index.js'),
    import('../../tools/web/index.js'),
    import('../../tools/agent/index.js'),
    import('../../tools/memory/index.js'),
  ]);
  for (let i = 0; i < extensionModules.length; i++) {
    const before = toolRegistry.list().length;
    await extensionModules[i].default.register(extensionCtx);
    toolCounts[TOOL_GROUPS[i]] = toolRegistry.list().length - before;
  }

  const tools = new ToolsService({ registry: toolRegistry, gatewayUrl });
  await tools.connect();
  setGatewayCall((target, method, params) => tools.call(target, method, params));

  return { tools, toolCounts };
}

async function seedDefaultCronTasks(config: VargosConfig, dataDir: string): Promise<void> {
  if (config.cron?.tasks) return;
  config.cron = { tasks: DEFAULT_CRON_TASKS };
  await saveConfig(dataDir, config);
}

async function teardown(services: BootedServices, dataDir: string): Promise<void> {
  await services.mcpClients.disconnectAll();
  await services.mcpBridge.stopHttp().catch(() => {});
  await services.mcpBridge.disconnect();
  if (services.webhooks) {
    await services.webhooks.stopHttp().catch(() => {});
    await services.webhooks.disconnect();
  }
  await services.agent.disconnect();
  await services.channels.stopAdapters();
  await services.channels.disconnect();
  services.cron.stopAll();
  await services.cron.disconnect();
  await services.tools.disconnect();
  await services.sessions.disconnect();
  await getMemoryContext().close().catch(() => {});
  await services.gateway.stop();
  await removePidFile(dataDir);
  await releaseLock();
}

export async function start(): Promise<void> {
  const bootStart = Date.now();
  const log = (s: string) => console.error(s);
  const dataDir = resolveDataDir();
  const workspaceDir = resolveWorkspaceDir();

  const lockHolder = await acquireLock(dataDir);
  if (lockHolder) {
    log(`\n  Another instance running (host: ${lockHolder.host}, PID: ${lockHolder.pid}) — exiting.\n`);
    process.exit(1);
  }
  await writePidFile(dataDir);

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

  const { resolveModel } = await import('../../config/pi-config.js');
  const primary = resolveModel(config);
  const primaryName = config.agent.primary;

  const connectErr = await checkLocalProvider(primary.provider, primary.baseUrl);
  if (connectErr) {
    log(`  ✗ ${connectErr}`);
    process.exit(1);
  }

  initPaths(config.paths);

  const gatewayHost = config.gateway?.host ?? '127.0.0.1';
  const gatewayPort = config.gateway?.port ?? 9000;
  const gatewayUrl = resolveGatewayUrl(config.gateway);

  const gateway = new GatewayServer({ port: gatewayPort, host: gatewayHost });
  await gateway.start();

  const serviceStatuses: ServiceStatus[] = [];
  serviceStatuses.push({ name: 'Gateway', ok: true, detail: gatewayUrl });

  const fileSessionService = new FileSessionService({ baseDir: dataDir });
  const sessions = new SessionsService({ sessionService: fileSessionService, gatewayUrl });
  await sessions.initialize();
  await sessions.connect();
  serviceStatuses.push({ name: 'Sessions', ok: true });

  const envKey = process.env[`${primary.provider.toUpperCase()}_API_KEY`];
  const apiKey = envKey || primary.apiKey;

  const memoryStorage = await resolveMemoryStorage(config, dataDir);
  await initializeMemoryContext({
    memoryDir: workspaceDir,
    cacheDir: path.join(dataDir, 'cache'),
    embeddingProvider: config.embedding?.provider ?? 'none',
    openaiApiKey: config.embedding?.apiKey,
    embeddingModel: config.embedding?.model,
    chunkSize: 400,
    chunkOverlap: 80,
    hybridWeight: { vector: 0.7, text: 0.3 },
    storage: memoryStorage,
    sessionsDir: path.join(dataDir, 'sessions'),
    enableFileWatcher: process.env.NODE_ENV === 'development',
  });
  serviceStatuses.push({ name: 'Memory', ok: true });

  const extensionCtx: ExtensionContext = {
    registerTool: (tool) => toolRegistry.register(tool),
    paths: { dataDir, workspaceDir },
  };

  const { tools, toolCounts } = await initTools(extensionCtx, gatewayUrl);

  const { McpClientManager } = await import('../../mcp/client.js');
  const mcpClients = new McpClientManager(toolRegistry);
  const mcpServerCount = await mcpClients.connectAll(config.mcpServers);
  if (mcpServerCount > 0) {
    serviceStatuses.push({ name: 'MCP Servers', ok: true, detail: `${mcpServerCount} connected` });
  }

  const totalTools = toolRegistry.list().length;
  const groupSummary = TOOL_GROUPS
    .filter(g => toolCounts[g] > 0)
    .map(g => `${g}: ${toolCounts[g]}`)
    .join(', ');
  serviceStatuses.push({ name: 'Tools', ok: true, detail: `${totalTools} (${groupSummary})` });

  await seedDefaultCronTasks(config, dataDir);

  const cron = new CronService({
    gatewayUrl,
    onPersist: async (tasks) => {
      const current = await loadConfig(dataDir);
      if (!current) return;
      current.cron = { tasks: tasks.map((t) => ({ id: t.id, name: t.name, schedule: t.schedule, task: t.task, enabled: t.enabled, notify: t.notify })) };
      await saveConfig(dataDir, current);
    },
  });
  await cron.connect();

  for (const t of config.cron?.tasks ?? []) {
    cron.addTask(t);
  }

  const runtime = new PiAgentRuntime({ sessionService: fileSessionService });
  const agent = new AgentService({ gatewayUrl, workspaceDir, dataDir, runtime });
  await agent.connect();
  serviceStatuses.push({ name: 'Agent', ok: true });

  if (config.heartbeat?.enabled) {
    const { createHeartbeatTask } = await import('../../cron/tasks/heartbeat.js');
    createHeartbeatTask(cron, config.heartbeat, workspaceDir, () => runtime.listActiveRuns().length);
  }

  cron.startAll();
  const cronCount = cron.listTasks().length;
  serviceStatuses.push({ name: 'Cron', ok: true, detail: `${cronCount} task${cronCount !== 1 ? 's' : ''}` });

  const channels = new ChannelService({ gatewayUrl });
  await channels.connect();

  if (config.channels) {
    const { createAdapter } = await import('../../channels/factory.js');
    const onInbound: OnInboundMessageFn = (ch, userId, content, metadata) =>
      channels.onInboundMessage(ch, userId, content, metadata);
    for (const [type, chConfig] of Object.entries(config.channels)) {
      if (chConfig.enabled === false) continue;
      try {
        const adapter = createAdapter({ type: type as ChannelType, enabled: true, ...chConfig }, onInbound);
        await channels.addAdapter(adapter);
        await adapter.initialize();
        await adapter.start();
        if (adapter.status === 'connecting') {
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => { if (done) return; done = true; clearInterval(poll); clearTimeout(deadline); resolve(); };
            const poll = setInterval(() => { if (adapter.status !== 'connecting') finish(); }, 200);
            const deadline = setTimeout(finish, 3000);
          });
        }
        serviceStatuses.push({ name: 'Channel', ok: true, detail: `${type} ${adapter.status}` });
      } catch (err) {
        serviceStatuses.push({ name: 'Channel', ok: false, detail: `${type} (${err instanceof Error ? err.message : String(err)})` });
      }
    }
  }

  let webhooks: import('../../webhooks/service.js').WebhookService | undefined;
  if (config.webhooks?.hooks?.length) {
    const { WebhookService } = await import('../../webhooks/service.js');
    webhooks = new WebhookService({
      gatewayUrl,
      hooks: config.webhooks.hooks,
      port: config.webhooks.port,
      host: config.webhooks.host,
    });
    await webhooks.connect();
    await webhooks.startHttp();
    const whPort = config.webhooks.port ?? 9002;
    const whHost = config.webhooks.host ?? '127.0.0.1';
    serviceStatuses.push({ name: 'Webhooks', ok: true, detail: `http://${whHost}:${whPort} (${config.webhooks.hooks.length} hook${config.webhooks.hooks.length !== 1 ? 's' : ''})` });
  }

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

  renderBanner({
    version: VERSION,
    profile: { name: primaryName, provider: primary.provider, model: primary.model },
    dataDir,
  });
  renderServices(serviceStatuses);
  renderMcp(mcpUrl, openapiUrl);
  renderReady({
    services: gateway.registry.list().length,
    tools: totalTools,
    bootMs: Date.now() - bootStart,
  });
  renderNextSteps();

  const booted: BootedServices = { gateway, sessions, tools, cron, agent, channels, mcpBridge, mcpClients, webhooks };

  const shutdown = async () => {
    log('\n  Shutting down...');
    const forceExit = setTimeout(() => process.exit(1), 5_000);
    forceExit.unref();
    await teardown(booted, dataDir);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('SIGUSR2', async () => {
    log('\n  Restarting...');
    await teardown(booted, dataDir);
    const { spawn } = await import('node:child_process');
    spawn(process.execPath, [...extractLoaderArgs(process.execArgv), ...process.argv.slice(1)], {
      detached: true,
      stdio: 'inherit',
    }).unref();
    process.exit(0);
  });
}
