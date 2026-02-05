/**
 * Shared boot sequence for MCP server and CLI
 * All startup output flows through here so both entry points see progress
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkEnv, validateConfig, checkLocalProvider } from './config/validate.js';
import { initializeWorkspace, isWorkspaceInitialized, loadContextFiles } from './config/workspace.js';
import { resolveDataDir, resolveWorkspaceDir } from './config/paths.js';
import { checkIdentitySetup } from './config/identity.js';
import { loadConfig, syncPiSdkFiles } from './config/pi-config.js';
import { initializeToolRegistry, toolRegistry } from './tools/index.js';
import { initializeServices, type ServiceConfig } from './services/factory.js';
import { initializePiAgentRuntime } from './agent/runtime.js';
import { initializeCronScheduler, getCronScheduler } from './cron/scheduler.js';
import { isHeartbeatEmpty, startHeartbeat, stopHeartbeat } from './cron/heartbeat.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

function shortenHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

export interface BootResult {
  workspaceDir: string;
  dataDir: string;
  contextFiles: Array<{ name: string; content: string }>;
  provider: string;
  model: string;
  apiKey: string | undefined;
  baseUrl: string | undefined;
}

/**
 * Core boot sequence shared by MCP server and CLI
 * Logs progress to stderr so both entry points show it
 */
export async function boot(opts?: { interactive?: boolean }): Promise<BootResult> {
  const workspaceDir = resolveWorkspaceDir();
  const dataDir = resolveDataDir();
  const log = (s: string) => console.error(s);

  log('');
  log(`  Vargos v${VERSION}`);
  log('');
  log('  Config');
  log(`    Data       ${shortenHome(dataDir)}`);
  log(`    Workspace  ${shortenHome(workspaceDir)}`);
  log('');

  const { warnings: envWarnings } = checkEnv();
  for (const w of envWarnings) log(`  ${w}`);

  log('  Boot');

  // Workspace
  if (!(await isWorkspaceInitialized(workspaceDir))) {
    await initializeWorkspace({ workspaceDir });
  }
  log('    Workspace  ok');

  // Identity (TTY only)
  await checkIdentitySetup(workspaceDir);
  log('    Identity   ok');

  // Config — single config.json as source of truth
  let config = await loadConfig(dataDir);
  if (!config) {
    if (process.stdin.isTTY) {
      const { interactivePiConfig } = await import('./config/onboard.js');
      await interactivePiConfig(dataDir);
      config = await loadConfig(dataDir);
    }
    if (!config) {
      log('    No config found. Run: vargos config');
      process.exit(1);
    }
  }
  // Validate config before proceeding
  const validation = validateConfig(config);
  for (const w of validation.warnings) log(`  ⚠ ${w}`);
  if (!validation.valid) {
    for (const e of validation.errors) log(`  ✗ ${e}`);
    log('');
    process.exit(1);
  }

  // Check local provider reachability before proceeding
  const connectErr = await checkLocalProvider(config.agent.provider, config.agent.baseUrl);
  if (connectErr) {
    log(`  ✗ ${connectErr}`);
    log('');
    process.exit(1);
  }

  await syncPiSdkFiles(workspaceDir, config.agent);
  const provider = config.agent.provider;
  const model = config.agent.model;
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const apiKey = envKey || config.agent.apiKey;
  log(`    Agent      ${provider} / ${model}`);

  // Tools
  await initializeToolRegistry();
  log(`    Tools      ${toolRegistry.list().length} registered`);

  // Services
  const serviceConfig: ServiceConfig = {
    fileMemoryDir: dataDir,
    openaiApiKey: process.env.OPENAI_API_KEY,
    workspaceDir,
  };
  await initializeServices(serviceConfig);
  log('    Services   ok');

  // Runtime
  initializePiAgentRuntime();
  log('    Runtime    ok');

  // Context files
  const contextFiles = await loadContextFiles(workspaceDir);
  log('');
  const EXPECTED = ['AGENTS.md', 'SOUL.md', 'USER.md', 'TOOLS.md', 'MEMORY.md', 'HEARTBEAT.md', 'BOOTSTRAP.md'];
  log(`  Context (${contextFiles.length} of ${EXPECTED.length})`);
  if (contextFiles.length > 0) {
    log(`    ${contextFiles.map((f) => f.name).join('  ')}`);
  }
  log('');

  return { workspaceDir, dataDir, contextFiles, provider, model, apiKey, baseUrl: config.agent.baseUrl };
}

/**
 * Start cron, heartbeat, and channel adapters
 */
export async function startBackgroundServices(workspaceDir: string): Promise<void> {
  const log = (s: string) => console.error(s);

  log('  Background');

  // Cron
  const scheduler = initializeCronScheduler(workspaceDir);
  scheduler.startAll();
  log(`    Scheduler  ${scheduler.listTasks().length} task(s)`);

  // Heartbeat
  let heartbeatContent = '';
  try {
    heartbeatContent = await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
  } catch { /* missing */ }

  if (!isHeartbeatEmpty(heartbeatContent)) {
    startHeartbeat(workspaceDir);
    log('    Heartbeat  30m');
  } else {
    log('    Heartbeat  off (empty)');
  }
  log('');

  // Channels
  const { loadChannelConfigs } = await import('./channels/config.js');
  const { createAdapter } = await import('./channels/factory.js');
  const { getChannelRegistry } = await import('./channels/registry.js');

  let channelConfigs = await loadChannelConfigs();
  let enabledChannels = channelConfigs.filter((c) => c.enabled);
  const channelRegistry = getChannelRegistry();

  if (enabledChannels.length === 0 && process.stdin.isTTY) {
    const { runOnboarding } = await import('./channels/onboard.js');
    log('  Channels');
    log('    none configured');
    log('');
    await runOnboarding();
    channelConfigs = await loadChannelConfigs();
    enabledChannels = channelConfigs.filter((c) => c.enabled);
  }

  if (enabledChannels.length > 0) {
    log('  Channels');
    for (const cfg of enabledChannels) {
      try {
        const adapter = createAdapter(cfg);
        channelRegistry.register(adapter);
        await adapter.initialize();
        await adapter.start();
        log(`    ${cfg.type.padEnd(10)} ${adapter.status}`);
      } catch (err) {
        log(`    ${cfg.type.padEnd(10)} failed (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    log('');
  }
}

/**
 * Graceful shutdown: stop heartbeat, cron, channels, release PID lock
 */
export async function shutdown(): Promise<void> {
  stopHeartbeat();
  getCronScheduler().stopAll();
  const { getChannelRegistry } = await import('./channels/registry.js');
  await getChannelRegistry().stopAll();
  await releaseProcessLock();
}

/**
 * Process-level PID lock — prevents duplicate instances
 */
export async function acquireProcessLock(): Promise<boolean> {
  const pidFile = path.join(resolveDataDir(), 'vargos.pid');
  try {
    await fs.mkdir(path.dirname(pidFile), { recursive: true });
  } catch { /* exists */ }

  try {
    const existing = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
    if (existing && existing !== process.pid) {
      try {
        process.kill(existing, 0);
        return false;
      } catch { /* stale lock */ }
    }
  } catch { /* no lock file */ }

  await fs.writeFile(pidFile, String(process.pid));
  return true;
}

export async function releaseProcessLock(): Promise<void> {
  try {
    await fs.unlink(path.join(resolveDataDir(), 'vargos.pid'));
  } catch { /* already gone */ }
}
