/**
 * Playwright downloads its browsers out-of-band, so a fresh machine resolves the MCP
 * server via npx but then has no chromium to drive.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Doctor } from './index.js';

function browsersDir(): string {
  const override = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  return override || path.join(os.homedir(), '.cache', 'ms-playwright');
}

const doctor: Doctor = {
  id: '020-playwright',
  title: 'Playwright browsers',

  async detect({ mcpServers }) {
    const uses = mcpServers.some(s => (s.args ?? []).some(arg => arg.includes('@playwright/mcp')));
    if (!uses) return { state: 'skip', why: 'no MCP server uses Playwright' };

    const dir = browsersDir();
    const installed = existsSync(dir) && readdirSync(dir).some(e => /^(chromium|firefox|webkit)/.test(e));
    if (installed) return { state: 'ok' };

    return { state: 'missing', detail: `no browsers found in ${dir}` };
  },

  fix: {
    why: 'Downloads chromium plus the OS packages it links against (may prompt for sudo).',
    command: 'npx playwright install --with-deps chromium',
  },
};

export default doctor;
