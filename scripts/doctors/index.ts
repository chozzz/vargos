/**
 * Environment doctors — detect unmet external prerequisites (uv, Playwright browsers)
 * and offer the fix. Run interactively by the first-run journey (`cli/ready.ts`) and
 * `vargos config`; detect-only on daemon boot and before `vargos chat` hands off to pi.
 *
 * Unlike migrations, doctors are not run-once: the condition can come back (a purged
 * cache, a reinstalled Node, a newly added MCP server), so they re-check every run.
 * That is also why detect() must be cheap and side-effect free.
 *
 * To add one: drop `NNN-name.ts` here. Numbers use gaps of 10 so you can insert, and
 * are display order only — doctors are independent, never sequenced.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { getDataPaths, type DataPaths } from '../../lib/paths.js';
import { toMessage } from '../../lib/error.js';
import { readJson } from '../../lib/util.js';

/** `skip` means the check doesn't apply to this install — nothing here needs it. */
export type Status =
  | { state: 'ok' }
  | { state: 'skip'; why: string }
  | { state: 'missing'; detail: string };

export interface McpServer {
  name: string;
  command?: string;
  args?: string[];
}

export interface DoctorContext {
  paths: DataPaths;
  /** Enabled MCP servers — most prerequisites only matter if a server actually needs them. */
  mcpServers: McpServer[];
}

export interface Doctor {
  /** Stable id, e.g. '010-uv'. */
  id: string;
  title: string;
  /** Cheap and side-effect free — this runs on every boot. */
  detect(ctx: DoctorContext): Promise<Status>;
  /** Shown verbatim, run only on explicit consent. Omit when there's nothing to automate. */
  fix?: { why: string; command: string };
}

export interface Diagnosis {
  doctor: Doctor;
  status: Status;
}

/** Is `cmd` resolvable on PATH? */
export function onPath(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface McpEntry {
  command?: string;
  args?: string[];
  enabled?: boolean;
}

function buildContext(): DoctorContext {
  const paths = getDataPaths();
  const config = readJson<{ mcpServers?: Record<string, McpEntry | string> }>(
    path.join(paths.dataDir, 'agent', 'mcp.json'),
  );

  const mcpServers = Object.entries(config?.mcpServers ?? {})
    .map(([name, entry]) => (typeof entry === 'string' ? { name, command: entry } : { name, ...entry }))
    .filter(server => server.enabled !== false);

  return { paths, mcpServers };
}

/** Load `NNN-*.ts|js` siblings, sorted by filename. */
async function loadDoctors(): Promise<Doctor[]> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = (await fs.readdir(dir))
    .filter(file => /^\d.*\.(js|ts)$/.test(file) && !file.endsWith('.d.ts'))
    .sort();

  const doctors: Doctor[] = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href) as { default?: Doctor };
    if (mod.default) doctors.push(mod.default);
  }
  return doctors;
}

/** Run every detect(). A doctor that throws is reported as missing, never fatal. */
export async function diagnose(): Promise<Diagnosis[]> {
  const ctx = buildContext();
  const results: Diagnosis[] = [];

  for (const doctor of await loadDoctors()) {
    try {
      results.push({ doctor, status: await doctor.detect(ctx) });
    } catch (err) {
      results.push({ doctor, status: { state: 'missing', detail: `check failed: ${toMessage(err)}` } });
    }
  }
  return results;
}

/**
 * Detect-only, for non-interactive callers (daemon boot, pre-chat). One line per unmet
 * prerequisite; never prompts, never throws.
 */
export async function reportProblems(log: { warn(s: string): void }): Promise<void> {
  for (const { doctor, status } of await diagnose()) {
    if (status.state !== 'missing') continue;
    log.warn(`${doctor.title}: ${status.detail} — run "vargos config" to fix`);
  }
}

/** Interactive pass: walk the unmet prerequisites one at a time and offer each fix. */
export async function runDoctors(): Promise<void> {
  const p = await import('@clack/prompts');
  const results = await diagnose();
  const problems = results.filter(r => r.status.state === 'missing');

  if (problems.length === 0) {
    p.log.success(`Environment ready (${results.length} check${results.length === 1 ? '' : 's'}).`);
    return;
  }

  for (const { doctor, status } of problems) {
    const detail = (status as { detail: string }).detail;
    if (!doctor.fix) {
      p.log.warn(`${doctor.title}: ${detail}`);
      continue;
    }

    p.note(`${detail}\n\n${doctor.fix.why}\n\n  ${doctor.fix.command}`, doctor.title);

    const consent = await p.confirm({ message: 'Run this command now?', initialValue: true });
    if (p.isCancel(consent) || !consent) {
      p.log.warn(`Skipped — run "vargos config" to revisit.`);
      continue;
    }

    try {
      // Inherited stdio: these installers are interactive (sudo, progress bars).
      execSync(doctor.fix.command, { stdio: 'inherit' });
      p.log.success(`${doctor.title}: done.`);
    } catch {
      p.log.error(`${doctor.title}: command failed — run it manually.`);
    }
  }
}
