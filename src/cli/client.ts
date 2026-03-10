import chalk from 'chalk';
import { ServiceClient } from '../gateway/service-client.js';
import { loadAndValidate } from './boot.js';
import { resolveGatewayUrl } from '../config/paths.js';
import { startSpinner } from '../lib/spinner.js';

interface RunCompletedPayload {
  sessionKey: string;
  runId?: string;
  success: boolean;
  response?: string;
}

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;
  private stopThinking?: () => void;
  private firstDelta = true;
  private completionWaiters = new Map<string, (payload: RunCompletedPayload) => void>();
  private toolHandlers = new Map<string, (event: { runId: string; sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: unknown; result?: unknown }) => void>();

  constructor(gatewayUrl: string) {
    super({
      service: 'cli',
      methods: [],
      events: [],
      subscriptions: ['run.delta', 'run.completed', 'run.tool'], // Added: run.tool subscription
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
    if (event === 'run.tool' && this.toolHandlers.size > 0) {
      // Forward to all registered handlers (for chat CLI)
      for (const handler of this.toolHandlers.values()) {
        handler(payload as { runId: string; sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: unknown; result?: unknown });
      }
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

  /** Listen to tool call events */
  onTool(handler: (event: { runId: string; sessionKey: string; toolName: string; phase: 'start' | 'end'; args?: unknown; result?: unknown }) => void): void {
    if (!this.toolHandlers.has('chat')) {
      this.toolHandlers.set('chat', handler);
    }
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
