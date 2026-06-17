#!/usr/bin/env node
/**
 * Vargos CLI — surface 1, a thin projection of the bus registry.
 *
 *   vargos <service>                  list that service's methods
 *   vargos <service> --help           descriptions + arg shapes (from the registry)
 *   vargos <service> <method> [args]  invoke service.method
 *
 * Connects to a running daemon on :9000 first and proxies over JSON-RPC; if the port
 * is refused, boots a local stack with only the needed service(s), runs, and disposes.
 *
 * Built-in commands (not registry methods): start, onboard, chat, sync, migrate.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDataPaths } from './lib/paths.js';
import { parseCli, buildParams, renderList, renderHelp, RpcClient, type ParsedCli } from './core/cli.js';
import { bootLocal } from './core/local.js';
import { discoverServiceNames } from './core/services.js';
import type { MethodInfo } from './core/types.js';

// ── Runtime guard (undici 8.x needs Node >= 22.19) ───────────────────────────────

const MIN_NODE: [number, number] = [22, 19];
const v = process.versions.node.split('.').map(Number);
if (v[0] < MIN_NODE[0] || (v[0] === MIN_NODE[0] && v[1] < MIN_NODE[1])) {
  process.stderr.write(`Vargos requires Node.js >= ${MIN_NODE.join('.')}. You are running ${process.versions.node}.\n`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
const pkgPath = existsSync(path.join(here, 'package.json'))
  ? path.join(here, 'package.json')
  : path.join(here, '..', 'package.json');
const VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

async function usage(): Promise<void> {
  console.log(`
  ⚡ Vargos — Self-hosted agent OS  (v${VERSION})

  Usage:
    vargos start                 Boot the daemon (bus + all services + JSON-RPC :9000)
    vargos <service>             List a service's methods
    vargos <service> --help      Show methods, descriptions, and arg shapes
    vargos <service> <method> …  Invoke a method            (e.g. vargos channel send <sessionKey> "<msg>")

  Built-ins:
    onboard                      Interactive setup wizard
    chat                         Interactive chat session with the agent
    sync                         Update bundled templates
    migrate                      Run pending data migrations
    --version, -v                Show version
    --help, -h                   Show this help`);

  console.log(await renderServices());
  console.log();
}

/**
 * Services section, derived from what's registered. With a daemon up, lists every
 * service and its method names live from the registry; otherwise lists the known
 * services from the static map (booting them all just to print help is too costly).
 */
const OVERVIEW_METHOD_CAP = 6; // above this, summarize as a count to keep the overview scannable

async function renderServices(): Promise<string> {
  const { host, port } = gatewayAddress();
  const client = new RpcClient(host, port);

  if (await client.isUp()) {
    const all = await client.call<MethodInfo[]>('bus.list', {});
    const byService = new Map<string, string[]>();
    for (const m of all) {
      if (m.internal) continue; // hide plumbing (bus.list/has, agent.appendMessage)
      const short = m.name.includes('.') ? m.name.slice(m.name.indexOf('.') + 1) : m.name;
      (byService.get(m.service) ?? byService.set(m.service, []).get(m.service)!).push(short);
    }
    const pad = Math.max(7, ...[...byService.keys()].map(s => s.length)) + 1;
    const lines: string[] = [];
    for (const [svc, methods] of byService) {
      // Sub-namespaced methods (e.g. mcp.<server>.<tool>) → break down by server with counts.
      if (methods.some(m => m.includes('.'))) {
        const sub = new Map<string, number>();
        for (const m of methods) {
          const server = m.includes('.') ? m.slice(0, m.indexOf('.')) : m;
          sub.set(server, (sub.get(server) ?? 0) + 1);
        }
        const subpad = Math.max(...[...sub.keys()].map(s => s.length)) + 2;
        lines.push(`    ${svc}`);
        for (const [server, n] of sub) lines.push(`        ${server.padEnd(subpad)}${n} tool${n === 1 ? '' : 's'}`);
      } else if (methods.length > OVERVIEW_METHOD_CAP) {
        lines.push(`    ${svc.padEnd(pad)}${methods.length} methods — run "vargos ${svc}"`);
      } else {
        lines.push(`    ${svc.padEnd(pad)}${methods.join(', ')}`);
      }
    }
    return `\n  Services (live — run "vargos <service> --help" for arg shapes):\n${lines.join('\n')}`;
  }

  const names = discoverServiceNames(here, ext).join(', ');
  return `\n  Services (discovered in services/):\n    ${names}\n\n  Daemon not running — "vargos <service>" lists a service's methods; "vargos start" then "vargos --help" shows them all.`;
}

/** Gateway address from config.json, mirroring boot defaults. */
function gatewayAddress(): { host: string; port: number } {
  let gw: { host?: string; port?: number } = {};
  try {
    const cfg = JSON.parse(readFileSync(getDataPaths().configFile, 'utf8'));
    gw = cfg.gateway ?? {};
  } catch { /* no config yet */ }
  return {
    host: gw.host ?? process.env.BUS_HOST ?? '127.0.0.1',
    port: gw.port ?? (process.env.BUS_PORT ? parseInt(process.env.BUS_PORT, 10) : 9000),
  };
}

function print(result: unknown): void {
  if (result === null || result === undefined) console.log('(no result)');
  else if (typeof result === 'string') console.log(result);
  else console.log(JSON.stringify(result, null, 2));
}

// ── Built-in commands ────────────────────────────────────────────────────────────

async function runBuiltin(cmd: string): Promise<boolean> {
  switch (cmd) {
    case '--version': case '-v': console.log(VERSION); return true;
    case '--help': case '-h': usage(); return true;
    case 'start':
      await import('./index.js');
      await new Promise(() => {}); // TCP server keeps the loop alive
      return true;
    case 'onboard': {
      const { onboard } = await import('./cli/onboard.js');
      await onboard();
      return true;
    }
    case 'migrate': {
      const { runMigrations } = await import('./lib/migrate.js');
      await runMigrations(console, { dryRun: process.argv.includes('--dry-run') });
      return true;
    }
    case 'sync': {
      const p = await import('@clack/prompts');
      const { collectTemplateConflicts, overrideTemplates } = await import('./lib/templates.js');
      const conflicts = await collectTemplateConflicts();
      if (conflicts.length === 0) { p.log.success('Templates are up to date.'); return true; }
      const selected = await p.multiselect({
        message: 'These bundled templates changed. Select which to overwrite:',
        options: conflicts.map(c => ({ value: c.rel, label: c.rel })),
        required: false,
      });
      if (p.isCancel(selected)) { p.cancel('Cancelled.'); return true; }
      const chosen = conflicts.filter(c => (selected as string[]).includes(c.rel));
      await overrideTemplates(chosen);
      p.log.success(chosen.length ? `Updated ${chosen.length} file(s).` : 'Nothing selected.');
      return true;
    }
    case 'chat': {
      await import('./cli/chat.js').then(m => m.chat());
      return true;
    }
    default:
      return false;
  }
}

/**
 * `vargos channel pair <id> [--reset]` — interactive WhatsApp QR pairing. Not a registry
 * method: it must run locally (renders the QR in *this* terminal) and bypass the daemon,
 * which is the opposite of how registry methods proxy to :9000. Hence a channel subcommand.
 */
async function pairChannel(args: string[]): Promise<number> {
  const id = args.find(a => !a.startsWith('--'));
  if (!id) { console.error('Usage: vargos channel pair <channel-id> [--reset]'); return 1; }
  const authDir = path.join(getDataPaths().channelsDir, id);
  if (args.includes('--reset') && existsSync(authDir)) {
    rmSync(authDir, { recursive: true, force: true });
    console.log(`  Cleared stale auth state at ${authDir}`);
  }
  console.log(`\n  Pairing "${id}" — scan the QR with WhatsApp → Linked Devices.`);
  console.log('  Stop the daemon first if it is running, so it does not hold the session.\n');
  const { pairWhatsApp } = await import('./cli/channels.js');
  await pairWhatsApp(id);
  console.log('  Done. Run "vargos start" (or restart the daemon) to use it.\n');
  return 0;
}

// ── Registry-driven dispatch (the three-surface projection) ───────────────────────

async function dispatch(parsed: ParsedCli): Promise<number> {
  const service = parsed.service === 'channels' ? 'channel' : parsed.service!; // friendly alias
  const { host, port } = gatewayAddress();
  const client = new RpcClient(host, port);
  const daemonUp = await client.isUp();

  let infos: MethodInfo[];
  let invoke: (method: string, params: unknown) => Promise<unknown>;
  let cleanup = async () => {};

  if (daemonUp) {
    infos = await client.call<MethodInfo[]>('bus.list', { service });
    invoke = (m, p) => client.call(m, p);
  } else {
    // One-shot mode: services skip live startup (channel adapters, webhook HTTP) — we only
    // need the registry to introspect, and `live` methods are refused below anyway.
    process.env.VARGOS_CLI_ONESHOT = '1';
    const stack = await bootLocal([service], here, ext);
    infos = stack.bus.list(service);
    invoke = (m, p) => stack.bus.call(m, p);
    cleanup = stack.dispose;
  }

  try {
    if (infos.length === 0) {
      console.error(`Unknown service "${service}". Run "vargos --help".`);
      return 1;
    }
    // Listings hide internal plumbing; an explicitly-named internal method still runs.
    const visible = infos.filter(i => !i.internal);
    if (!parsed.method) {
      console.log(parsed.help ? renderHelp(service, visible) : renderList(service, visible));
      // `pair` is a CLI-local subcommand, not a registry method, so surface it here.
      if (service === 'channel') console.log('\n  channel pair <id> [--reset]  Pair/repair a WhatsApp channel (interactive QR)');
      return 0;
    }

    const fullName = `${service}.${parsed.method}`;
    const info = infos.find(i => i.name === fullName);
    if (!info) {
      console.error(`Unknown method "${parsed.method}".\n\n${renderList(service, visible)}`);
      return 1;
    }
    if (parsed.help) { console.log(renderHelp(service, [info])); return 0; }

    if (!daemonUp && info.live) {
      console.error(`❌ "${fullName}" needs the daemon (live channels / session state / background runs).\n   Start it first:  vargos start`);
      return 1;
    }

    const params = buildParams(info, parsed.args);
    print(await invoke(fullName, params));
    return 0;
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await cleanup();
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const parsed = parseCli(argv);

if (!parsed.service) {
  if (parsed.help || argv.includes('--help') || argv.includes('-h')) { await usage(); process.exit(0); }
  if (!existsSync(getDataPaths().configFile)) {
    console.log(`  ⚡ Vargos v${VERSION} — first run.\n`);
    const { onboard } = await import('./cli/onboard.js');
    await onboard();
    console.log('\n  Next: run "vargos start" to boot the daemon.\n');
  } else {
    await usage();
  }
  process.exit(0);
}

if (parsed.reserved) {
  const handled = await runBuiltin(parsed.service);
  process.exit(handled ? 0 : 1);
}

// `channel pair` is a CLI-local interactive action (QR), not a registry/daemon method.
if ((parsed.service === 'channel' || parsed.service === 'channels') && parsed.method === 'pair') {
  process.exit(await pairChannel(parsed.args));
}

process.exit(await dispatch(parsed));
