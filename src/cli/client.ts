import chalk from 'chalk';
import { ServiceClient } from '../gateway/service-client.js';
import { loadAndValidate } from './boot.js';
import { resolveGatewayUrl } from '../config/paths.js';
import { startSpinner } from '../lib/spinner.js';

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;
  private stopThinking?: () => void;
  private firstDelta = true;

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
      this.clearThinking();
      const { delta } = payload as { delta: string };
      this.deltaHandler(delta);
    }
  }

  onDelta(handler: (delta: string) => void): void {
    this.deltaHandler = handler;
  }

  /** Show animated "Thinking..." until the first delta arrives */
  startThinking(): void {
    this.firstDelta = true;
    this.stopThinking = startSpinner('Thinking...');
  }

  private clearThinking(): void {
    if (!this.firstDelta) return;
    this.firstDelta = false;
    this.stopThinking?.();
    this.stopThinking = undefined;
  }
}

export async function connectToGateway(): Promise<CliClient> {
  const { config } = await loadAndValidate();
  const client = new CliClient(resolveGatewayUrl(config.gateway));

  try {
    await client.connect();
  } catch {
    console.error(chalk.red('\n  Cannot connect to Vargos gateway.'));
    console.error(chalk.gray('  Start the server first: vargos gateway start\n'));
    process.exit(1);
  }

  return client;
}
