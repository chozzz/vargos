/**
 * Shared boot sequence for MCP server and CLI
 * Handles config validation, workspace init, tool registry, and services
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { checkConfig } from './config/validate.js';
import { interactiveConfig } from './config/onboard.js';
import { initializeWorkspace, isWorkspaceInitialized, loadContextFiles } from './config/workspace.js';
import { resolveDataDir, resolveWorkspaceDir } from './config/paths.js';
import { checkIdentitySetup } from './config/identity.js';
import { initializeToolRegistry } from './tools/index.js';
import { initializeServices, type ServiceConfig } from './services/factory.js';
import { initializePiAgentRuntime } from './agent/runtime.js';
import { initializeCronScheduler, getCronScheduler } from './cron/scheduler.js';
import { isHeartbeatEmpty, startHeartbeat, stopHeartbeat } from './cron/heartbeat.js';

export interface BootResult {
  workspaceDir: string;
  dataDir: string;
  contextFiles: Array<{ name: string; content: string }>;
}

/**
 * Core boot sequence shared by MCP server and CLI
 * - Validates config (prompts interactively if TTY)
 * - Initializes workspace + identity
 * - Registers tools
 * - Initializes services + runtime
 */
export async function boot(opts?: { interactive?: boolean }): Promise<BootResult> {
  const { valid: configValid, missing } = checkConfig();

  if (!configValid && opts?.interactive !== false && process.stdin.isTTY) {
    await interactiveConfig();
  } else if (!configValid) {
    console.error('');
    console.error('Configuration Error');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Missing required configuration:');
    for (const config of missing) {
      console.error(`  ${config.key}: ${config.why}`);
    }
    console.error('');
    console.error('Set these environment variables or run interactively.');
    console.error('');
    process.exit(1);
  }

  const workspaceDir = resolveWorkspaceDir();
  const dataDir = resolveDataDir();

  // Workspace init
  if (!(await isWorkspaceInitialized(workspaceDir))) {
    console.error('  Initializing workspace...');
    await initializeWorkspace({ workspaceDir });
  }

  // Identity check (TTY only)
  await checkIdentitySetup(workspaceDir);

  // Tools
  await initializeToolRegistry();

  // Services
  const serviceConfig: ServiceConfig = {
    memory: (process.env.VARGOS_MEMORY_BACKEND as 'file' | 'qdrant' | 'postgres') ?? 'file',
    sessions: (process.env.VARGOS_SESSIONS_BACKEND as 'file' | 'postgres') ?? 'file',
    fileMemoryDir: dataDir,
    qdrantUrl: process.env.QDRANT_URL,
    qdrantApiKey: process.env.QDRANT_API_KEY,
    postgresUrl: process.env.POSTGRES_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    workspaceDir,
  };

  await initializeServices(serviceConfig);
  initializePiAgentRuntime();

  const contextFiles = await loadContextFiles(workspaceDir);

  return { workspaceDir, dataDir, contextFiles };
}

/**
 * Start cron, heartbeat, and channel adapters
 */
export async function startBackgroundServices(workspaceDir: string): Promise<void> {
  // Cron
  const scheduler = initializeCronScheduler(workspaceDir);
  scheduler.startAll();
  const taskCount = scheduler.listTasks().length;
  console.error(`    Scheduler  ${taskCount} task(s)`);

  // Heartbeat
  let heartbeatContent = '';
  try {
    heartbeatContent = await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
  } catch { /* missing */ }

  if (!isHeartbeatEmpty(heartbeatContent)) {
    startHeartbeat(workspaceDir);
    console.error('    Heartbeat  30m');
  } else {
    console.error('    Heartbeat  off (empty)');
  }

  // Channels
  const { loadChannelConfigs } = await import('./channels/config.js');
  const { createAdapter } = await import('./channels/factory.js');
  const { getChannelRegistry } = await import('./channels/registry.js');

  let channelConfigs = await loadChannelConfigs();
  let enabledChannels = channelConfigs.filter((c) => c.enabled);
  const channelRegistry = getChannelRegistry();

  if (enabledChannels.length === 0 && process.stdin.isTTY) {
    const { runOnboarding } = await import('./channels/onboard.js');
    console.error('  Channels');
    console.error('    none configured');
    console.error('');
    await runOnboarding();
    channelConfigs = await loadChannelConfigs();
    enabledChannels = channelConfigs.filter((c) => c.enabled);
  }

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
