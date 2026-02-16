import chalk from 'chalk';
import { ServiceClient } from '../client/client.js';
import { loadAndValidate } from './boot.js';

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;

  constructor(gatewayUrl: string) {
    super({
      service: 'cli',
      methods: [],
      events: [],
      subscriptions: ['run.delta', 'run.completed'],
      gatewayUrl,
    });
  }

  async handleMethod(): Promise<unknown> {
    throw new Error('CLI handles no methods');
  }

  handleEvent(event: string, payload: unknown): void {
    if (event === 'run.delta' && this.deltaHandler) {
      const { delta } = payload as { delta: string };
      this.deltaHandler(delta);
    }
  }

  onDelta(handler: (delta: string) => void): void {
    this.deltaHandler = handler;
  }
}

export async function connectToGateway(): Promise<CliClient> {
  const { config } = await loadAndValidate();

  const host = config.gateway?.host ?? '127.0.0.1';
  const port = config.gateway?.port ?? 9000;
  const gatewayUrl = `ws://${host}:${port}`;
  const client = new CliClient(gatewayUrl);

  try {
    await client.connect();
  } catch {
    console.error(chalk.red('\n  Cannot connect to Vargos gateway.'));
    console.error(chalk.gray('  Start the server first: vargos gateway start\n'));
    process.exit(1);
  }

  return client;
}
