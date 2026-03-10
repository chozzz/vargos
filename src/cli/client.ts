import chalk from 'chalk';
import { ServiceClient } from '../gateway/service-client.js';
import { loadAndValidate } from './boot.js';
import { resolveGatewayUrl } from '../config/paths.js';
import { startSpinner } from '../lib/spinner.js';

export interface RunCompletedPayload {
  sessionKey: string;
  runId?: string;
  success: boolean;
  response?: string;
}

export interface ToolEvent {
  runId: string;
  sessionKey: string;
  toolName: string;
  phase: 'start' | 'end';
  args?: unknown;
  result?: unknown;
}

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;
  private toolHandler?: (event: ToolEvent) => void;
  private stopThinking?: () => void;
  private firstDelta = true;
  private completionWaiters = new Map<string, (payload: RunCompletedPayload) => void>();

  constructor(gatewayUrl: string) {
    super({
      service: 'cli',
      methods: [],
      events: [],
      subscriptions: ['run.delta', 'run.completed', 'run.tool'],
      gatewayUrl,
    });
  }

  async handleMethod(): Promise<unknown> {
    throw new Error('CLI handles no methods');
  }

  handleEvent(event: string, payload: unknown): void {
    if (event === 'run.delta' && this.deltaHandler) {
      const p = payload as { type?: string; data?: string };
      if (p.type !== 'text_delta' || !p.data) return;
      this.clearThinking();
      this.deltaHandler(p.data);
    }
    if (event === 'run.completed') {
      const p = payload as RunCompletedPayload;
      const waiter = this.completionWaiters.get(p.sessionKey);
      if (waiter) {
        this.completionWaiters.delete(p.sessionKey);
        waiter(p);
      }
    }
    if (event === 'run.tool' && this.toolHandler) {
      this.clearThinking();
      this.toolHandler(payload as ToolEvent);
    }
  }

  /** Wait for next run.completed event on a given session (for re-trigger runs). */
  waitForCompletion(sessionKey: string, timeoutMs = 300_000): Promise<RunCompletedPayload> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.completionWaiters.delete(sessionKey);
        reject(new Error('Timed out waiting for sub-agent completion'));
      }, timeoutMs);

      this.completionWaiters.set(sessionKey, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  onDelta(handler: (delta: string) => void): void {
    this.deltaHandler = handler;
  }

  onTool(handler: (event: ToolEvent) => void): void {
    this.toolHandler = handler;
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
