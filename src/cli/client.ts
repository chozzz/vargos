import chalk from 'chalk';
import { ServiceClient } from '../gateway/service-client.js';
import { loadAndValidate } from './boot.js';

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;
  private thinkingTimer?: ReturnType<typeof setInterval>;
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
    if (!process.stderr.isTTY) return;
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const dim = chalk.dim;
    process.stderr.write(dim(`  ${frames[0]} Thinking...`));
    this.thinkingTimer = setInterval(() => {
      i = (i + 1) % frames.length;
      process.stderr.write(`\r${dim(`  ${frames[i]} Thinking...`)}`);
    }, 80);
  }

  private clearThinking(): void {
    if (!this.firstDelta) return;
    this.firstDelta = false;
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = undefined;
    }
    process.stderr.write('\r\x1b[K'); // clear the line
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
