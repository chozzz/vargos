import chalk from 'chalk';
import { readGatewayPid } from '../pid.js';
import { resolveDataDir } from '../../config/paths.js';
import { loadConfig } from '../../config/pi-config.js';
import { ServiceClient } from '../../client/client.js';

class StatusProbe extends ServiceClient {
  constructor(gatewayUrl: string) {
    super({
      service: 'status-probe',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

export async function status(): Promise<void> {
  const pid = await readGatewayPid();
  if (!pid) {
    console.log(chalk.yellow('  Gateway is not running.'));
    return;
  }

  console.log(chalk.green(`  Gateway is running (PID: ${pid})`));

  // Attempt health probe
  const config = await loadConfig(resolveDataDir());
  const host = config?.gateway?.host ?? '127.0.0.1';
  const port = config?.gateway?.port ?? 9000;
  const url = `ws://${host}:${port}`;

  try {
    const probe = new StatusProbe(url);
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    console.log(chalk.green(`  Gateway reachable at ${chalk.cyan(url)}`));
    await probe.disconnect();
  } catch {
    console.log(chalk.yellow(`  Gateway process alive but not reachable at ${chalk.cyan(url)}`));
  }
}
