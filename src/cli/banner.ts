import os from 'node:os';
import chalk from 'chalk';

export interface ServiceStatus {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface BannerData {
  version: string;
  profile: { name: string; provider: string; model: string };
  dataDir: string;
}

const DIM = chalk.dim;
const OK = chalk.green('✓');
const FAIL = chalk.red('✗');
const WARN = chalk.yellow('⚠');
const URL = chalk.cyan;
const LABEL = chalk.gray;
const BOLD = chalk.bold;

function shortenHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function pad(label: string, width = 12): string {
  return label.padEnd(width);
}

// Write to stderr (keeps stdout clean for MCP stdio transport)
const out = (s: string) => process.stderr.write(s + '\n');

const LOGO = [
  ['#   #', '#   #', '#   #', ' # # ', '  #  '], // V
  [' ### ', '#   #', '#####', '#   #', '#   #'], // A
  ['#### ', '#   #', '#### ', '#  # ', '#   #'], // R
  [' ####', '#    ', '#  ##', '#   #', ' ### '], // G
  [' ### ', '#   #', '#   #', '#   #', ' ### '], // O
  [' ####', '#    ', ' ### ', '    #', '#### '], // S
];

const LOGO_COLORS = ['#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];

function renderLogo(): void {
  for (let row = 0; row < 5; row++) {
    let line = '  ';
    for (let i = 0; i < LOGO.length; i++) {
      const color = chalk.hex(LOGO_COLORS[i]);
      for (const ch of LOGO[i][row]) {
        line += ch === '#' ? color('██') : '  ';
      }
      if (i < LOGO.length - 1) line += '  ';
    }
    out(line);
  }
}

export function renderBanner(data: BannerData): void {
  out('');
  renderLogo();
  out(`  ${DIM('v' + data.version)}`);
  out('');
  out(`  ${LABEL(pad('Agent'))}${data.profile.provider} ${DIM('/')} ${data.profile.model} ${DIM(`(${data.profile.name})`)}`);
  out(`  ${LABEL(pad('Data'))}${shortenHome(data.dataDir)}`);
  out('');
}

export function renderServices(services: ServiceStatus[]): void {
  out(`  ${LABEL('Services')}`);
  for (const s of services) {
    const icon = s.ok ? OK : FAIL;
    const detail = s.detail ? DIM(` ${s.detail}`) : '';
    out(`    ${icon} ${pad(s.name)}${detail}`);
  }
}

export function renderMcp(url: string, openapiUrl?: string): void {
  out('');
  out(`  ${LABEL(pad('MCP'))}${URL(url)}`);
  if (openapiUrl) out(`  ${LABEL(pad('OpenAPI'))}${URL(openapiUrl)}`);
}

export function renderReady(data: {
  services: number;
  tools: number;
  bootMs?: number;
}): void {
  const parts = [`${data.services} services`, `${data.tools} tools`];
  const timing = data.bootMs ? DIM(`  ${(data.bootMs / 1000).toFixed(1)}s`) : '';
  out('');
  out(`  ${chalk.green(BOLD('Ready'))} ${DIM('—')} ${parts.join(DIM(', '))}${timing}`);
}

export function renderNextSteps(): void {
  const cmds: [string, string][] = [
    ['vargos chat', 'Interactive session'],
    ['vargos run "task"', 'One-shot task'],
    ['vargos cron list', 'Scheduled tasks'],
    ['vargos sessions list', 'Past sessions'],
    ['vargos health', 'System health'],
  ];
  const maxCmd = Math.max(...cmds.map(([c]) => c.length));
  out('');
  for (const [cmd, desc] of cmds) {
    out(`  ${URL(cmd)}${DIM(' '.repeat(maxCmd - cmd.length + 4) + desc)}`);
  }
  out('');
}

export function renderHealthCheck(data: {
  config: boolean;
  profile?: { name: string; provider: string; model: string };
  apiKey: boolean;
  gateway?: { url: string; ok: boolean; services?: number };
  warnings?: string[];
  errors?: string[];
}): void {
  out('');
  out(`  ${BOLD('vargos')} ${DIM('health')}`);
  out('');

  // Config
  out(`  ${LABEL('Config')}`);
  if (!data.config) {
    out(`    ${FAIL} ${pad('config.json')}not found`);
    out('');
    return;
  }
  out(`    ${OK} ${pad('config.json')}found`);
  if (data.profile) {
    out(`    ${OK} ${pad('agent')}${data.profile.provider} ${DIM('/')} ${data.profile.model} ${DIM(`(${data.profile.name})`)}`);
  }
  out(`    ${data.apiKey ? OK : FAIL} ${pad('API key')}${data.apiKey ? 'present' : 'missing'}`);

  for (const w of data.warnings ?? []) out(`    ${WARN} ${w}`);
  for (const e of data.errors ?? []) out(`    ${FAIL} ${e}`);

  // Gateway
  out('');
  out(`  ${LABEL('Gateway')}`);
  if (!data.gateway) {
    out(`    ${FAIL} ${pad('status')}not configured`);
  } else if (data.gateway.ok) {
    out(`    ${OK} ${pad('status')}reachable at ${URL(data.gateway.url)}`);
    if (data.gateway.services !== undefined) {
      out(`    ${OK} ${pad('services')}${data.gateway.services} connected`);
    }
  } else {
    out(`    ${FAIL} ${pad('status')}cannot connect to ${URL(data.gateway.url)}`);
    out(`    ${DIM('  Start the server: vargos gateway start')}`);
  }

  out('');
}
