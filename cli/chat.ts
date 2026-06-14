/**
 * `vargos chat` — launch the pi coding-agent CLI against the Vargos data dir.
 * Seeds templates, ensures the MCP adapter is installed, then hands off to pi.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { getDataPaths } from '../lib/paths.js';
import { createLogger } from '../lib/logger.js';
import { readJson } from '../lib/util.js';
import { seedDataDir } from '../lib/templates.js';

export async function chat(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const paths = getDataPaths();
  await seedDataDir(createLogger('seed'));

  const dataDir = paths.dataDir;
  const agentDir = path.join(dataDir, 'agent');

  // Find pi CLI via node_modules (required for global npm installs).
  let piCliPath = 'pi';
  let searchDir = here;
  while (searchDir !== '/') {
    const candidate = path.join(searchDir, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'cli.js');
    if (existsSync(candidate)) { piCliPath = candidate; break; }
    searchDir = path.dirname(searchDir);
  }

  // Ensure pi-mcp-adapter is installed to the Vargos agent directory.
  try {
    const settings = readJson<{ packages?: string[] }>(path.join(agentDir, 'settings.json')) ?? {};
    if (!(settings.packages ?? []).includes('npm:pi-mcp-adapter')) {
      try {
        execSync(`node "${piCliPath}" install npm:pi-mcp-adapter`, {
          stdio: 'pipe',
          env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
        });
      } catch { /* chat still works without MCP */ }
    }
  } catch { /* skip MCP setup on any issue */ }

  execSync(`node "${piCliPath}" --session-dir "${dataDir}/sessions/cli"`, {
    stdio: 'inherit',
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, VARGOS_DATA_DIR: dataDir },
  });
}
