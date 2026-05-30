#!/usr/bin/env node
/**
 * Vargos CLI — single entrypoint for npx @chozzz/vargos
 *
 *   vargos                first-run → onboard wizard, else → help
 *   vargos start          boot the gateway + all services
 *   vargos onboard        interactive setup (provider, model, API key, channels)
 *   vargos config         print current configuration
 *   vargos --version      print version
 *   vargos --help         print usage
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL_TYPES } from './services/config/schemas/channels.js';
import type { ChannelEntry } from './services/config/schemas/channels.js';
import { getDataPaths } from './lib/paths.js';

// ── Runtime guard ────────────────────────────────────────────────────────────

const MIN_NODE = 20;
const v = process.versions.node.split('.').map(Number);
if (v[0] < MIN_NODE) {
  process.stderr.write(
    `Vargos requires Node.js >= ${MIN_NODE}. You are running ${process.versions.node}.\n`,
  );
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = existsSync(path.join(__dirname, 'package.json'))
  ? path.join(__dirname, 'package.json')
  : path.join(__dirname, '..', 'package.json');
const VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

function usage(): void {
  console.log(`
  ⚡ Vargos — Self-hosted agent OS

  Usage:
    vargos                 First-run setup or show this help
    vargos start           Boot the agent server (gateway + all services)
    vargos onboard         Interactive setup wizard (provider, model, API key, channels)
    vargos config          Show current configuration
    vargos channels        Manage messaging channels (list, register, deregister, pair)
    vargos chat            Start an interactive chat session with the agent

  Options:
    --version, -v          Show version
    --help, -h             Show this help
`);
}

function showConfig(): void {
  const { configFile, dataDir } = getDataPaths();
  const agentDir = `${dataDir}/agent`;

  console.log(`Configuration directory: ${dataDir}\n`);

  const files: Array<{ label: string; path: string }> = [
    { label: 'App config', path: configFile },
    { label: 'Agent models', path: `${agentDir}/models.json` },
    { label: 'Agent auth', path: `${agentDir}/auth.json` },
    { label: 'Agent settings', path: `${agentDir}/settings.json` },
  ];

  for (const { label, path: fp } of files) {
    const exists = existsSync(fp);
    console.log(`  ${exists ? '✓' : '✗'} ${label}: ${fp}`);
    if (exists) {
      try {
        const content = readFileSync(fp, 'utf8');
        const truncated =
          content.length > 500
            ? content.slice(0, 500).replace(/"key":\s*"[^"]{4,}"/g, '"key": "***"') + '\n  … (truncated)'
            : content.replace(/"key":\s*"[^"]{4,}"/g, '"key": "***"');
        console.log(`    ${truncated.split('\n').join('\n    ')}`);
      } catch {
        console.log('    (unable to read)');
      }
    }
    console.log();
  }
}

function isFirstRun(): boolean {
  const { configFile } = getDataPaths();
  return !existsSync(configFile);
}

// ── Arg dispatch ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];

// --version / -v
if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION);
  process.exit(0);
}

// --help / -h
if (cmd === '--help' || cmd === '-h') {
  usage();
  process.exit(0);
}

// config subcommand
if (cmd === 'config') {
  showConfig();
  process.exit(0);
}

// onboard subcommand
if (cmd === 'onboard') {
  const { onboard } = await import('./cli/onboard.js');
  await onboard();
  process.exit(0);
}

// start subcommand
if (cmd === 'start') {
  try {
    // Boot the gateway + all services (index.ts)
    // The TCP server will keep the event loop alive indefinitely
    await import('./index.js');
    // Once services are booted, wait forever (TCP server keeps event loop alive)
    await new Promise(() => { });
  } catch (err) {
    console.error('Failed to start Vargos:', err);
    process.exit(1);
  }
}

// chat subcommand
if (cmd === 'chat') {
  // Seed data dir first (replaces tsx scripts/seed.ts)
  const paths = getDataPaths();
  const { createLogger } = await import('./lib/logger.js');
  const log = createLogger('seed');
  await (await import('./lib/templates.js')).seedDataDir(log);

  // Then run pi CLI with environment variables
  const { execSync } = await import('node:child_process');
  const dataDir = paths.dataDir;
  const agentDir = `${dataDir}/agent`;

  // Find pi CLI via node_modules (required for global npm installs)
  let piCliPath = 'pi';
  try {
    // Search for pi package in node_modules up the tree
    let searchDir = __dirname;
    while (searchDir !== '/') {
      const piPath = path.join(searchDir, 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'cli.js');
      if (existsSync(piPath)) {
        piCliPath = piPath;
        break;
      }
      searchDir = path.dirname(searchDir);
    }
  } catch {
    // fallback to 'pi' command
  }

  // Ensure pi-mcp-adapter is installed to the Vargos agent directory
  try {
    const settingsPath = path.join(agentDir, 'settings.json');
    const settingsContent = existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, 'utf8'))
      : {};
    const packages = settingsContent.packages ?? [];

    if (!packages.includes('npm:pi-mcp-adapter')) {
      // Auto-install pi-mcp-adapter silently
      try {
        execSync(`node "${piCliPath}" install npm:pi-mcp-adapter`, {
          stdio: 'pipe',
          env: {
            ...process.env,
            PI_CODING_AGENT_DIR: agentDir,
          },
        });
      } catch {
        // Silently ignore MCP setup failure — chat still works without it
      }
    }
  } catch {
    // Skip MCP setup if there's any issue
  }

  execSync(`node "${piCliPath}" --session-dir "${dataDir}/sessions/cli"`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      VARGOS_DATA_DIR: dataDir,
    },
  });
}

// channels subcommand
if (cmd === 'channels') {
  const sub = process.argv[3];
  const { listChannels, registerChannel, deregisterChannel, pairWhatsApp } = await import('./cli/channels.js');

  if (sub === 'list' || !sub) {
    const channels = listChannels();
    if (channels.length === 0) {
      console.log('No channels configured.\n');
      console.log('  vargos channels register whatsapp <id>');
      console.log('  vargos channels register telegram <id> --bot-token <token>');
    } else {
      console.log('Channels:\n');
      for (const ch of channels) {
        const status = ch.type === 'whatsapp'
          ? (ch.registered ? '✅ paired' : '⚠ not paired')
          : '✅ configured';
        const tokenHint = ch.botToken ? ` (key: ${ch.botToken.slice(0, 8)}…)` : '';
        console.log(`  ${ch.id}  [${ch.type}]  ${status}${tokenHint}`);
      }
      console.log('');
    }
    process.exit(0);
  }

  if (sub === 'register') {
    const type = process.argv[4] as ChannelEntry['type'] | undefined;
    const id = process.argv[5];

    if (!type || !id || !(CHANNEL_TYPES as readonly string[]).includes(type)) {
      console.log(`Usage: vargos channels register <${CHANNEL_TYPES.join('|')}> <id> [--bot-token <token>]`);
      process.exit(1);
    }

    try {
      const tgBotKey = type === 'telegram'
        ? process.argv[process.argv.indexOf('--bot-token') + 1]
        : undefined;

      if (type === 'telegram' && !tgBotKey) {
        console.log('Telegram requires --bot-token <token>');
        process.exit(1);
      }

      registerChannel({ id, type, botToken: tgBotKey });
      console.log(`✅ Channel "${id}" registered.`);

      if (type === 'whatsapp') {
        console.log(`   Run "vargos channels pair whatsapp ${id}" to scan the QR code.`);
      }
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (sub === 'deregister') {
    const id = process.argv[4];
    if (!id) {
      console.log('Usage: vargos channels deregister <id>');
      process.exit(1);
    }
    try {
      deregisterChannel(id);
      console.log(`✅ Channel "${id}" removed.`);
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (sub === 'pair') {
    const type = process.argv[4];
    const id = process.argv[5];
    if (type !== 'whatsapp' || !id) {
      console.log('Usage: vargos channels pair whatsapp <id>');
      process.exit(1);
    }
    console.log('Scan the QR code with WhatsApp → Linked Devices\n');
    try {
      await pairWhatsApp(id);
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.log('Usage: vargos channels [list|register|deregister|pair]');
  process.exit(1);
}

// No command — first-run or help
if (isFirstRun()) {
  console.log('  ⚡ Vargos v' + VERSION + ' — First run detected.\n');
  const { onboard } = await import('./cli/onboard.js');
  await onboard();
  console.log('\n  Next: run vargos start to boot the server.\n');
} else {
  usage();
}

process.exit(0);