/**
 * Startup banner display
 */

import os from 'node:os';

const EXPECTED_CONTEXT_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'USER.md',
  'TOOLS.md',
  'MEMORY.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
];

/** Replace homedir prefix with ~ for display */
function shortenHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

export function printStartupBanner(options: {
  mode: 'mcp' | 'cli';
  version: string;
  workspace: string;
  contextDir?: string;
  memoryBackend: string;
  sessionsBackend: string;
  dataDir?: string;
  contextFiles: { name: string; path: string }[];
  tools: { name: string; description: string }[];
  transport?: string;
  port?: number;
  host?: string;
  endpoint?: string;
}): void {
  const log = (s: string) => console.error(s);

  log('');
  log(`  Vargos v${options.version}`);
  log('');

  log('  Config');
  log(`    Data      ${shortenHome(options.dataDir ?? '~/.vargos')}`);
  log(`    Workspace ${shortenHome(options.workspace)}`);
  log(`    Memory    ${options.memoryBackend}`);
  log(`    Sessions  ${options.sessionsBackend}`);
  if (options.transport) {
    log(`    Transport ${options.transport}`);
  }
  log('');

  const loadedNames = options.contextFiles.map((f) => f.name);
  const totalExpected = EXPECTED_CONTEXT_FILES.length;
  log(`  Context (${loadedNames.length} of ${totalExpected} loaded)`);
  log(`    ${loadedNames.join('  ')}`);
  log('');

  if (options.tools.length > 0) {
    log(`  Tools (${options.tools.length})`);

    const categories: Record<string, string[]> = {
      'File': [], 'Shell': [], 'Web': [],
      'Memory': [], 'Session': [], 'Cron': [],
    };

    for (const tool of options.tools) {
      if (tool.name.match(/read|write|edit/)) categories['File'].push(tool.name);
      else if (tool.name.match(/exec|process/)) categories['Shell'].push(tool.name);
      else if (tool.name.match(/web|browser/)) categories['Web'].push(tool.name);
      else if (tool.name.match(/memory/)) categories['Memory'].push(tool.name);
      else if (tool.name.match(/session/)) categories['Session'].push(tool.name);
      else if (tool.name.match(/cron/)) categories['Cron'].push(tool.name);
      else categories['Cron'].push(tool.name);
    }

    for (const [category, tools] of Object.entries(categories)) {
      if (tools.length > 0) {
        log(`    ${category.padEnd(10)}${tools.join(', ')}`);
      }
    }
    log('');
  }
}
