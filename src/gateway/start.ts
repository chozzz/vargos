import path from 'node:path';
import { createRequire } from 'node:module';
import { GatewayServer } from './server.js';
import { ToolsService } from '../services/tools/service.js';
import { SessionsService } from '../services/sessions/service.js';
import { CronService } from '../services/cron/service.js';
import { ChannelService } from '../services/channels/service.js';
import type { OnInboundMessageFn } from '../services/channels/types.js';
import { AgentService } from '../services/agent/service.js';
import { McpBridge } from '../edge/mcp/server.js';
import { toolRegistry } from '../services/tools/registry.js';
import { FileSessionService } from '../services/sessions/file-store.js';
import { PiAgentRuntime } from '../services/agent/runtime.js';
import { initializeMemoryContext, getMemoryContext } from '../services/memory/context.js';
import { resolveDataDir, resolveWorkspaceDir, resolveCacheDir, resolveGatewayUrl, initPaths } from '../config/paths.js';
import type { MemoryStorage } from '../services/memory/types.js';
import { loadConfig, saveConfig } from '../config/pi-config.js';
import type { VargosConfig } from '../config/pi-config.js';
import { validateConfig, checkLocalProvider } from '../config/validate.js';
import { initializeWorkspace, isWorkspaceInitialized } from '../config/workspace.js';
import type { ExtensionContext } from '../services/tools/extension.js';
import { setGatewayCall } from '../services/agent/extension.js';
import { extractLoaderArgs } from '../lib/loader-args.js';
import { reapSessions } from '../services/sessions/reaper.js';
import { acquireLock, releaseLock } from './lock.js';
import { toMessage, classifyError, sanitizeError } from '../lib/error.js';
import { writePidFile, removePidFile } from './pid.js';
import {
  renderBanner,
  renderServices,
  renderMcp,
  renderReady,
  type ServiceStatus,
} from './banner.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

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
  {
    id: 'error-review',
    name: 'Error Review (Daily)',
    schedule: '0 20 * * *',
    task: 'Read ~/.vargos/errors.jsonl. Group errors by class and recurring patterns. For each pattern: count occurrences, identify root cause, suggest a fix. Write a concise summary to the "Error Review" section of HEARTBEAT.md using checklist format (- [ ] ...). If no errors or all are transient retries, reply: HEARTBEAT_OK',
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
  mcpClients: import('../edge/mcp/client.js').McpClientManager;
  webhooks?: import('../edge/webhooks/service.js').WebhookService;
}

async function resolveMemoryStorage(config: VargosConfig, dataDir: string, log: (s: string) => void): Promise<MemoryStorage> {
  const storageType = config.storage?.type ?? 'sqlite';
  if (storageType === 'postgres' && config.storage?.url) {
    try {
      const { MemoryPostgresStorage } = await import('../services/memory/postgres-storage.js');
      const pg = new MemoryPostgresStorage({ url: config.storage.url });
      await pg.initialize();
      return pg;
    } catch (err) {
      log(`  ⚠ PostgreSQL unavailable (${sanitizeError(toMessage(err))}) — falling back to SQLite`);
    }
  }
  const { MemorySQLiteStorage } = await import('../services/memory/sqlite-storage.js');
  return new MemorySQLiteStorage({ dbPath: path.join(resolveCacheDir(), 'memory.db') });
}

interface InitToolsOpts {
  extensionCtx: ExtensionContext;
  gatewayUrl: string;
}

async function initTools(opts: InitToolsOpts): Promise<{ tools: ToolsService; toolCounts: Record<string, number> }> {
  const toolCounts: Record<string, number> = {};
  const extensionModules = await Promise.all([
    import('../services/tools/fs/index.js'),
    import('../services/tools/web/index.js'),
    import('../services/tools/agent/index.js'),
    import('../services/tools/memory/index.js'),
  ]);
  for (let i = 0; i < extensionModules.length; i++) {
    const before = toolRegistry.list().length;
    await extensionModules[i].default.register(opts.extensionCtx);
    toolCounts[TOOL_GROUPS[i]] = toolRegistry.list().length - before;
  }

  const tools = new ToolsService({
    registry: toolRegistry,
    gatewayUrl: opts.gatewayUrl,
  });
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
  const { getBrowserService } = await import('../services/tools/web/browser-service.js');
  const browser = getBrowserService();
  await browser.closeAll().catch(() => {});
  browser.dispose();
  await services.gateway.stop();
  await removePidFile(dataDir);
  await releaseLock();
}

/** Map channel boot errors to actionable recovery hints */
function classifyChannelError(type: string, msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('bottoken') || lower.includes('bot_token') || lower.includes('requires a'))
    return `missing config — run: vargos config channel edit`;
  const errorClass = classifyError(msg);
  if (errorClass === 'auth')
    return `auth failed — check your ${type} credentials in config.json`;
  if (errorClass === 'transient')
    return `connection failed — check network and retry`;
  return msg;
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

  const config = await loadConfig(dataDir);
  if (!config) {
    log('  No config found. Create ~/.vargos/config.json to get started.');
    process.exit(1);
  }

  const validation = validateConfig(config);
  for (const w of validation.warnings) log(`  ⚠ ${w}`);
  if (!validation.valid) {
    for (const e of validation.errors) log(`  ✗ ${e}`);
    process.exit(1);
  }

  const { resolveModel } = await import('../config/pi-config.js');
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

  const memoryStorage = await resolveMemoryStorage(config, dataDir, log);
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

  const { tools, toolCounts } = await initTools({
    extensionCtx,
    gatewayUrl,
  });

  const { McpClientManager } = await import('../edge/mcp/client.js');
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
    const { createHeartbeatTask } = await import('../services/cron/tasks/heartbeat.js');
    createHeartbeatTask(cron, config.heartbeat, workspaceDir, () => runtime.listActiveRuns().length);
  }


  cron.startAll();
  const cronCount = cron.listTasks().length;
  serviceStatuses.push({ name: 'Cron', ok: true, detail: `${cronCount} task${cronCount !== 1 ? 's' : ''}` });

  // Run once at boot, then every 6 hours
  reapSessions(fileSessionService).catch(() => {});
  const reaperInterval = setInterval(
    () => reapSessions(fileSessionService).catch(() => {}),
    6 * 60 * 60 * 1000,
  );
  reaperInterval.unref();

  const channels = new ChannelService({ gatewayUrl, linkExpand: config.linkExpand });
  await channels.connect();

  if (config.channels) {
    const { createAdapter } = await import('../services/channels/factory.js');
    const onInbound: OnInboundMessageFn = (ch, userId, content, metadata) =>
      channels.onInboundMessage(ch, userId, content, metadata);
    for (const chConfig of config.channels) {
      if (chConfig.enabled === false) continue;
      try {
        const adapter = createAdapter(chConfig, onInbound);
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
        serviceStatuses.push({ name: 'Channel', ok: true, detail: `${chConfig.id} (${chConfig.type}) ${adapter.status}` });
      } catch (err) {
        const msg = toMessage(err);
        const hint = classifyChannelError(chConfig.type, msg);
        log(`Channel ${chConfig.id} (${chConfig.type}) failed to start: ${msg} — ${hint}`);
        serviceStatuses.push({ name: 'Channel', ok: false, detail: `${chConfig.id} (${chConfig.type}) error: ${msg}` });
      }
    }
  }

  // Recover orphaned channel messages from crash/restart (fire-and-forget)
  channels.recoverOrphanedMessages().catch(err =>
    log(`  ⚠ message recovery failed: ${toMessage(err)}`));

  let webhooks: import('../edge/webhooks/service.js').WebhookService | undefined;
  if (config.webhooks?.hooks?.length) {
    const { WebhookService } = await import('../edge/webhooks/service.js');
    webhooks = new WebhookService({
      gatewayUrl,
      hooks: config.webhooks.hooks,
      port: config.webhooks.port,
      host: config.webhooks.host,
      dataDir,
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
    const bearerToken = config.mcp?.bearerToken;
    if (bearerToken) {
      const mcpHost = config.mcp?.host ?? '127.0.0.1';
      const mcpPort = config.mcp?.port ?? 9001;
      const mcpEndpoint = config.mcp?.endpoint ?? '/mcp';
      await mcpBridge.startHttp({ host: mcpHost, port: mcpPort, endpoint: mcpEndpoint, bearerToken });
      mcpUrl = `http://${mcpHost}:${mcpPort}${mcpEndpoint}`;
      openapiUrl = `http://${mcpHost}:${mcpPort}/openapi.json`;
    } else {
      mcpUrl = 'disabled (no mcp.bearerToken)';
    }
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
