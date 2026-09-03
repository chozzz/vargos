/**
 * Status reaction controller
 * Maps an agent run to a single emoji reaction on the triggering message:
 * one stable "working" mark for the whole run (no thinking/tool churn — the
 * typing indicator already signals live activity), then a terminal done/error
 * that seals it. Every transition is deduped, so a long or steered run reacts
 * at most twice.
 */

export type ReactionPhase = 'working' | 'done' | 'error';

export interface ReactionAdapter {
  react(recipientId: string, messageId: string, emoji: string): Promise<void>;
}

const EMOJI: Record<ReactionPhase, string> = {
  working: '🤔',
  done:    '👍',
  error:   '❗',
};

export class StatusReactionController {
  private lastPhase: ReactionPhase | null = null;
  private sealed = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: ReactionAdapter,
    private readonly recipientId: string,
    private readonly messageId: string,
  ) {}

  /** Run is active. Idempotent — only the first call actually reacts. */
  setWorking(): void { this.set('working'); }
  setDone(): void    { this.set('done'); }
  setError(): void   { this.set('error'); }

  dispose(): void { /* no timers to clear */ }

  private set(phase: ReactionPhase): void {
    if (this.sealed || phase === this.lastPhase) return;
    this.lastPhase = phase;
    if (phase === 'done' || phase === 'error') this.sealed = true;
    const emoji = EMOJI[phase];
    this.chain = this.chain.then(() =>
      this.adapter.react(this.recipientId, this.messageId, emoji)
        .catch(() => { /* reaction failures are non-critical */ }),
    );
  }
}
