/**
 * Subagent completion registry
 * Tracks parent-child relationships and delivers results
 * via the appropriate channel when a subagent completes
 */

import { getSessionService } from '../services/factory.js';
import { getChannelRegistry } from '../channels/registry.js';
import { deliverReply } from '../lib/reply-delivery.js';
import { resolveWorkspaceDir, resolveSessionFile } from '../config/paths.js';
import { loadPiSettings, getPiApiKey } from '../config/pi-config.js';
import type { PiAgentRunResult } from './runtime.js';

interface TrackedSubagent {
  childKey: string;
  parentKey: string;
}

type DeliveryTarget =
  | { type: 'cli' }
  | { type: 'whatsapp'; recipientId: string }
  | { type: 'telegram'; chatId: string }
  | { type: 'cron' };

export class SubagentRegistry {
  private tracked = new Map<string, TrackedSubagent>();

  track(childKey: string, parentKey: string): void {
    this.tracked.set(childKey, { childKey, parentKey });
  }

  async complete(childKey: string, result: PiAgentRunResult): Promise<void> {
    const entry = this.tracked.get(childKey);
    if (!entry) return;
    this.tracked.delete(childKey);

    try {
      await this.repromptParent(entry, result);
    } catch (err) {
      console.error(
        `[SubagentRegistry] Failed to reprompt parent ${entry.parentKey}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  resolveDelivery(parentKey: string): DeliveryTarget {
    if (parentKey.startsWith('whatsapp:')) {
      return { type: 'whatsapp', recipientId: parentKey.slice('whatsapp:'.length) };
    }
    if (parentKey.startsWith('telegram:')) {
      return { type: 'telegram', chatId: parentKey.slice('telegram:'.length) };
    }
    if (parentKey.startsWith('cron:')) {
      return { type: 'cron' };
    }
    return { type: 'cli' };
  }

  private async repromptParent(
    entry: TrackedSubagent,
    result: PiAgentRunResult,
  ): Promise<void> {
    const sessions = getSessionService();

    // Inject a task message so the parent summarizes the result
    await sessions.addMessage({
      sessionKey: entry.parentKey,
      content:
        'A sub-agent you spawned just completed. ' +
        'Summarize the result above and relay the key findings to the user.',
      role: 'user',
      metadata: { type: 'task', source: 'subagent-registry', childKey: entry.childKey },
    });

    // Lazily import runtime to avoid circular dep at module load
    const { getPiAgentRuntime } = await import('./runtime.js');
    const runtime = getPiAgentRuntime();

    const workspaceDir = resolveWorkspaceDir();
    const piSettings = await loadPiSettings(workspaceDir);
    const provider = piSettings.defaultProvider || 'openai';
    const model = piSettings.defaultModel || 'gpt-4o-mini';
    const apiKey = await getPiApiKey(workspaceDir, provider);

    if (!apiKey) {
      console.error('[SubagentRegistry] No API key — skipping re-prompt');
      return;
    }

    const parentResult = await runtime.run({
      sessionKey: entry.parentKey,
      sessionFile: resolveSessionFile(entry.parentKey),
      workspaceDir,
      model,
      provider,
      apiKey,
      contextFiles: [],
    });

    const text = parentResult.response || '(subagent completed with no summary)';
    await this.deliver(entry.parentKey, text);
  }

  private async deliver(parentKey: string, text: string): Promise<void> {
    const target = this.resolveDelivery(parentKey);

    switch (target.type) {
      case 'cli': {
        console.log(`\n[Subagent result for ${parentKey}]\n${text}\n`);
        break;
      }
      case 'whatsapp': {
        const adapter = getChannelRegistry().get('whatsapp');
        if (!adapter) {
          console.error('[SubagentRegistry] WhatsApp adapter not registered');
          return;
        }
        const jid = `${target.recipientId}@s.whatsapp.net`;
        await deliverReply((chunk) => adapter.send(jid, chunk), text);
        break;
      }
      case 'telegram': {
        const adapter = getChannelRegistry().get('telegram');
        if (!adapter) {
          console.error('[SubagentRegistry] Telegram adapter not registered');
          return;
        }
        await deliverReply((chunk) => adapter.send(target.chatId, chunk), text);
        break;
      }
      case 'cron': {
        console.error(`[SubagentRegistry] Cron result for ${parentKey}: ${text.slice(0, 200)}`);
        break;
      }
    }
  }
}

let globalRegistry: SubagentRegistry | null = null;

export function getSubagentRegistry(): SubagentRegistry {
  if (!globalRegistry) {
    globalRegistry = new SubagentRegistry();
  }
  return globalRegistry;
}

export function initializeSubagentRegistry(): SubagentRegistry {
  globalRegistry = new SubagentRegistry();
  return globalRegistry;
}
