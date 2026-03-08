/**
 * Status reaction controller
 * Maps agent phases to emoji reactions on the triggering message.
 * Debounces transient states (thinking, tool) and seals on terminal ones (done, error).
 */

export type ReactionPhase = 'queued' | 'thinking' | 'tool' | 'done' | 'error';

export interface ReactionAdapter {
  react(recipientId: string, messageId: string, emoji: string): Promise<void>;
}

const EMOJI: Record<ReactionPhase, string> = {
  queued:   '👀',
  thinking: '🤔',
  tool:     '🔧',
  done:     '👍',
  error:    '❗',
};

const DEBOUNCE_MS = 500;

export class StatusReactionController {
  private sealed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Promise chain to serialize react() calls
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: ReactionAdapter,
    private readonly recipientId: string,
    private readonly messageId: string,
  ) {}

  setQueued(): void {
    this.immediate('queued');
  }

  setThinking(): void {
    this.debounced('thinking');
  }

  setTool(_toolName: string): void {
    this.debounced('tool');
  }

  setDone(): void {
    this.immediate('done');
  }

  setError(): void {
    this.immediate('error');
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private debounced(phase: ReactionPhase): void {
    if (this.sealed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.enqueue(phase);
    }, DEBOUNCE_MS);
  }

  private immediate(phase: ReactionPhase): void {
    if (this.sealed) return;
    // Cancel any pending debounced update
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (phase === 'done' || phase === 'error') this.sealed = true;
    this.enqueue(phase);
  }

  private enqueue(phase: ReactionPhase): void {
    const emoji = EMOJI[phase];
    this.chain = this.chain.then(() =>
      this.adapter.react(this.recipientId, this.messageId, emoji).catch(() => {}),
    );
  }
}
