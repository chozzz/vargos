import chalk from 'chalk';
import { resolveDataDir, resolveGatewayUrl } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { ServiceClient } from '../gateway/service-client.js';
import type { ServiceRegistration } from '../protocol/index.js';
import { startSpinner } from '../lib/spinner.js';

const DIM = chalk.dim;
const BOLD = chalk.bold;
const LABEL = chalk.gray;
const CYAN = chalk.cyan;

const out = (s: string) => process.stderr.write(s + '\n');

function firstLine(text: string | undefined, max: number): string {
  if (!text) return '-';
  const line = text.split('\n')[0].trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

class DebugProbe extends ServiceClient {
  constructor(gatewayUrl: string) {
    super({
      service: 'debug-probe',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

interface ToolInfo {
  name: string;
  description: string;
}

export async function inspect(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  if (!config) {
    out(chalk.red('No config found. Run vargos config llm edit first.'));
    return;
  }

  const url = resolveGatewayUrl(config.gateway);
  const stopSpinner = startSpinner('Connecting to gateway...');

  const probe = new DebugProbe(url);

  try {
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
  } catch {
    stopSpinner();
    out(chalk.red(`Cannot connect to gateway at ${url}`));
    out(DIM('  Start the server: vargos gateway start'));
    return;
  }

  let allServices: ServiceRegistration[];
  try {
    allServices = await probe.call<ServiceRegistration[]>('gateway', 'gateway.inspect', undefined, 5000);
  } catch (err) {
    stopSpinner();
    await probe.disconnect();
    out(chalk.red(`gateway.inspect failed: ${err instanceof Error ? err.message : err}`));
    return;
  }

  let tools: ToolInfo[] = [];
  try {
    tools = await probe.call<ToolInfo[]>('tools', 'tool.list', undefined, 5000);
  } catch { /* tools service may not be running */ }

  await probe.disconnect();

  stopSpinner();

  // Filter out transient probes (this probe, health-check)
  const ephemeral = new Set(['debug-probe', 'health-check']);
  const services = allServices.filter((s) => !ephemeral.has(s.service));

  out('');
  out(`  ${BOLD('vargos')} ${DIM('debug inspect')}`);

  // --- Services table ---
  out('');
  out(`  ${LABEL('Services')} ${DIM(`(${services.length})`)}`);

  const svcNameW = Math.max(7, ...services.map((s) => s.service.length)) + 2;
  const svcHead = [
    'Service'.padEnd(svcNameW), 'Ver'.padEnd(7),
    'Methods'.padEnd(9), 'Events'.padEnd(8), 'Subs',
  ];
  out(`  ${DIM(svcHead.join(''))}`);
  out(`  ${DIM('─'.repeat(svcHead.join('').length))}`);

  for (const svc of services) {
    const cols = [
      CYAN(svc.service.padEnd(svcNameW)),
      DIM(svc.version.padEnd(7)),
      String(svc.methods.length || '-').padEnd(9),
      String(svc.events.length || '-').padEnd(8),
      String(svc.subscriptions.length || '-'),
    ];
    out(`  ${cols.join('')}`);
  }

  // Expand method/event detail per service
  for (const svc of services) {
    if (!svc.methods.length && !svc.events.length && !svc.subscriptions.length) continue;
    out('');
    out(`  ${CYAN(svc.service)}`);
    if (svc.methods.length) out(`    methods  ${DIM(svc.methods.join(', '))}`);
    if (svc.events.length)  out(`    events   ${DIM(svc.events.join(', '))}`);
    if (svc.subscriptions.length) out(`    subs     ${DIM(svc.subscriptions.join(', '))}`);
  }

  // --- Tools table ---
  out('');
  out(`  ${LABEL('Tools')} ${DIM(`(${tools.length})`)}`);

  const toolNameW = Math.max(4, ...tools.map((t) => t.name.length)) + 2;
  const descW = Math.max(60, 100 - toolNameW);
  out(`  ${DIM('Name'.padEnd(toolNameW) + 'Description')}`);
  out(`  ${DIM('─'.repeat(toolNameW + descW))}`);

  for (const tool of tools) {
    const desc = firstLine(tool.description, descW);
    out(`  ${CYAN(tool.name.padEnd(toolNameW))}${DIM(desc)}`);
  }

  out('');
}
