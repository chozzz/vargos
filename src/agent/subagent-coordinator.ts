/**
 * Subagent orchestration — handles post-completion announcement and parent re-triggering.
 *
 * When a subagent finishes, it:
 * 1. Writes a subagent_announce message to the parent session so the LLM can see results
 * 2. Debounces re-triggers so multiple completing subagents batch into one parent wakeup
 * 3. Routes the parent result to the correct delivery target (channel or cron notify list)
 */

import { createLogger } from '../lib/logger.js';
import { parseTarget } from '../lib/channel-target.js';
import { parseSessionKey } from '../sessions/keys.js';
import type { PiAgentRunResult } from './runtime.js';

const log = createLogger('subagent');

const RETRIGGER_DEBOUNCE_MS = 3000;

export type CallFn = <T>(service: string, method: string, params: unknown) => Promise<T>;
export type RunAgentFn = (sessionKey: string, task: string) => Promise<PiAgentRunResult>;
export type DeliverFn = (channel: string, userId: string, result: PiAgentRunResult) => Promise<void>;

export class SubagentCoordinator {
  private retriggerTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly call: CallFn,
    private readonly runAgent: RunAgentFn,
    private readonly deliver: DeliverFn,
  ) {}

  clearTimers(): void {
    for (const timer of this.retriggerTimers.values()) clearTimeout(timer);
    this.retriggerTimers.clear();
  }

  async handleSubagentCompletion(sessionKey: string, result: PiAgentRunResult): Promise<void> {
    const session = await this.call<{ metadata?: Record<string, unknown> }>(
      'sessions', 'session.get', { sessionKey },
    );
    const parentKey = session?.metadata?.parentSessionKey as string | undefined;
    if (!parentKey) return;

    await this.announceToParent(sessionKey, parentKey, result);

    // Debounce: wait for concurrent subagents to finish before waking parent
    const existing = this.retriggerTimers.get(parentKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(
      () => this.triggerParentRun(parentKey),
      RETRIGGER_DEBOUNCE_MS,
    );
    this.retriggerTimers.set(parentKey, timer);
  }

  private async announceToParent(
    childKey: string,
    parentKey: string,
    result: PiAgentRunResult,
  ): Promise<void> {
    const status = result.success ? 'success' : 'error';
    const summary = result.response?.slice(0, 500) ?? '(no response)';
    const durationStr = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'unknown';

    await this.call('sessions', 'session.addMessage', {
      sessionKey: parentKey,
      content: `[Subagent Complete] session=${childKey} status=${status} duration=${durationStr}\n\n${summary}`,
      role: 'system',
      metadata: { type: 'subagent_announce', childSessionKey: childKey, success: result.success },
    }).catch((err: unknown) => log.error(`Failed to announce to parent: ${err}`));
  }

  private async triggerParentRun(parentKey: string): Promise<void> {
    this.retriggerTimers.delete(parentKey);
    log.info(`re-triggering parent ${parentKey} after sub-agent completions`);

    const task = await this.buildRetriggerTask(parentKey);
    const parentResult = await this.runAgent(parentKey, task);

    await this.routeParentResult(parentKey, parentResult);
  }

  private async routeParentResult(parentKey: string, result: PiAgentRunResult): Promise<void> {
    const rootKey = parentKey.split(':subagent:')[0];
    const { type } = parseSessionKey(rootKey);

    if (type === 'cron' || type === 'webhook') {
      const rootSession = await this.call<{ metadata?: Record<string, unknown> }>(
        'sessions', 'session.get', { sessionKey: rootKey },
      ).catch(() => null);
      const notify = (rootSession?.metadata?.notify as string[]) ?? [];
      for (const t of notify) {
        const parsed = parseTarget(t);
        if (parsed) await this.deliver(parsed.channel, parsed.userId, result);
      }
    } else {
      const target = parseTarget(rootKey);
      if (target) await this.deliver(target.channel, target.userId, result);
    }
  }

  private async buildRetriggerTask(parentKey: string): Promise<string> {
    const fallback =
      'Sub-agents completed. Review results above. If your original plan has remaining steps, continue executing them. Otherwise, synthesize a final response for the user.';

    try {
      const messages = await this.call<Array<{ role: string; content: string }>>(
        'sessions', 'session.getMessages', { sessionKey: parentKey, limit: 50 },
      );
      const lastUserMsg = [...(messages ?? [])].reverse().find(
        m => m.role === 'user' && !m.content.startsWith('[Subagent Complete]'),
      );
      if (!lastUserMsg) return fallback;

      return (
        `Sub-agents completed. Your original task was:\n\n> ${lastUserMsg.content.slice(0, 500)}\n\n` +
        'Review all sub-agent results above. If your plan has remaining steps, continue executing them (spawn more sub-agents as needed). Otherwise, synthesize a final response for the user.'
      );
    } catch {
      return fallback;
    }
  }
}
