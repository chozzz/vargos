import chalk from 'chalk';
import { resolveDataDir } from '../core/config/paths.js';
import { loadConfig } from '../core/config/pi-config.js';
import { validateConfig } from '../core/config/validate.js';
import { ServiceClient } from '../services/client.js';

class HealthProbe extends ServiceClient {
  constructor(gatewayUrl: string) {
    super({
      service: 'health-check',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

export async function health(): Promise<void> {
  console.log('\n  Health Check\n');

  // Config check
  console.log('  Config');
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  if (!config) {
    console.log(chalk.red('    ✗ config.json not found'));
    return;
  }
  console.log(chalk.green('    ✓ config.json found'));
  console.log(chalk.green(`    ✓ agent: ${config.agent.provider} / ${config.agent.model}`));

  const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
  if (envKey || config.agent.apiKey) {
    console.log(chalk.green('    ✓ API key present'));
  } else {
    console.log(chalk.red('    ✗ No API key'));
  }

  const validation = validateConfig(config);
  for (const e of validation.errors) console.log(chalk.red(`    ✗ ${e}`));
  for (const w of validation.warnings) console.log(chalk.yellow(`    ⚠ ${w}`));

  // Gateway check
  console.log('\n  Gateway');
  const host = config.gateway?.host ?? '127.0.0.1';
  const port = config.gateway?.port ?? 9000;
  const url = `ws://${host}:${port}`;

  try {
    const probe = new HealthProbe(url);
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    console.log(chalk.green(`    ✓ Reachable at ${url}`));
    await probe.disconnect();
  } catch {
    console.log(chalk.red(`    ✗ Cannot connect to ${url}`));
  }

  console.log('');
}
