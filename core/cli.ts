/**
 * CLI projection (surface 1). Pure helpers that turn the registry (MethodInfo[])
 * into listings, --help text, and a params object — plus a minimal JSON-RPC client
 * for proxying to a running daemon. Nothing here is hand-written per command; it all
 * derives from the registry.
 */

import type { MethodInfo } from './types.js';

// ─── argv parsing ────────────────────────────────────────────────────────────────

export interface ParsedCli {
  service?: string;
  method?: string;
  args: string[];
  help: boolean;
}

const RESERVED = new Set(['start', 'setup', 'config', 'chat', 'sync', '--help', '-h', '--version', '-v']);

/** Parse `vargos <service> [method] [args...] [--help]`. Returns reserved=true for built-in commands. */
export function parseCli(argv: string[]): ParsedCli & { reserved: boolean } {
  const help = argv.includes('--help') || argv.includes('-h');
  const rest = argv.filter(a => a !== '--help' && a !== '-h');
  const service = rest[0];
  return {
    reserved: !!service && RESERVED.has(service),
    service,
    method: rest[1],
    args: rest.slice(2),
    help,
  };
}

// ─── schema helpers ──────────────────────────────────────────────────────────────

interface JsonSchema {
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

function coerce(prop: { type?: string } | undefined, value: string | boolean): unknown {
  if (typeof value === 'boolean') return value;
  const t = prop?.type;
  if (t === 'number' || t === 'integer') { const n = Number(value); return Number.isNaN(n) ? value : n; }
  if (t === 'boolean') return value === 'true';
  return value;
}

/**
 * Build a params object from CLI args using the method's cli.positional order and
 * schema. Positionals map 1:1 to keys; `--flag value` and bare `--flag` (boolean)
 * are named overrides. Too many positionals → usage error (caller catches).
 * Missing required fields are left out so zod reports them identically on all surfaces.
 */
export function buildParams(info: MethodInfo, args: string[]): Record<string, unknown> {
  const schema = (info.schema ?? {}) as JsonSchema;
  const props = schema.properties ?? {};
  const positionalKeys = info.cli?.positional ?? [];

  const positionals: string[] = [];
  const named: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) { named[key] = true; }
      else { named[key] = next; i++; }
    } else {
      positionals.push(a);
    }
  }

  if (positionals.length > positionalKeys.length) {
    const shape = positionalKeys.length ? positionalKeys.map(k => `<${k}>`).join(' ') : '(named flags only)';
    throw new Error(`too many arguments for ${info.name}. Usage: ${info.service} ${info.name.split('.').slice(1).join('.')} ${shape}`);
  }

  const out: Record<string, unknown> = {};
  positionalKeys.forEach((key, idx) => {
    if (positionals[idx] !== undefined) out[key] = coerce(props[key], positionals[idx]);
  });
  for (const [k, v] of Object.entries(named)) out[k] = coerce(props[k], v);
  return out;
}

// ─── rendering ───────────────────────────────────────────────────────────────────

function shortMethod(info: MethodInfo): string {
  return info.name.includes('.') ? info.name.split('.').slice(1).join('.') : info.name;
}

/** Positional args in cli.positional order: `<key>` required, `[<key>]` optional. */
function positionalUsage(info: MethodInfo): string {
  const required = new Set(((info.schema ?? {}) as JsonSchema).required ?? []);
  return (info.cli?.positional ?? [])
    .map(k => (required.has(k) ? `<${k}>` : `[<${k}>]`))
    .join(' ');
}

/** Named flags (schema keys not consumed positionally): `--k <type>` / `[--k]` etc. */
function namedFlags(info: MethodInfo): string[] {
  const schema = (info.schema ?? {}) as JsonSchema;
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const positional = new Set(info.cli?.positional ?? []);
  const out: string[] = [];
  for (const [key, p] of Object.entries(props)) {
    if (positional.has(key)) continue;
    const flag = p.type === 'boolean' ? `--${key}` : `--${key} <${p.type ?? 'value'}>`;
    out.push(required.has(key) ? flag : `[${flag}]`);
  }
  return out;
}

/** Word-wrap to `width`, continuation lines prefixed with `indent`. */
function wrap(text: string, width: number, indent: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n' + indent);
}

/** `vargos <service>` — list that service's method names. */
export function renderList(service: string, infos: MethodInfo[]): string {
  if (infos.length === 0) return `No methods registered for "${service}".`;
  const width = Math.max(...infos.map(i => shortMethod(i).length));
  const lines = infos.map(i => `  ${service} ${shortMethod(i).padEnd(width)}  ${i.description.split('. ')[0]}`);
  return `${service} — ${infos.length} method${infos.length === 1 ? '' : 's'}\n\n${lines.join('\n')}`;
}

/** `vargos <service> --help` — usage line, wrapped description, and options per method. */
export function renderHelp(service: string, infos: MethodInfo[]): string {
  if (infos.length === 0) return `No methods registered for "${service}".`;
  const DESC = '      ';
  const OPTS = '      options: ';
  const blocks = infos.map(i => {
    const pos = positionalUsage(i);
    const out = [`  ${service} ${shortMethod(i)}${pos ? ' ' + pos : ''}`];
    out.push(`${DESC}${wrap(i.description, 72, DESC)}`);
    const flags = namedFlags(i);
    if (flags.length) out.push(`${OPTS}${wrap(flags.join(' '), 64, ' '.repeat(OPTS.length))}`);
    return out.join('\n');
  });
  return `${service} — ${infos.length} method${infos.length === 1 ? '' : 's'}\n\n${blocks.join('\n\n')}`;
}

// ─── JSON-RPC client ─────────────────────────────────────────────────────────────

export { RpcClient } from './rpc-client.js';
