/**
 * Inbound message pipeline — core policy orchestrator for normalized messages.
 * Handles: link expansion, whitelist enforcement, agent execution flow.
 */

import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
import type { NormalizedInboundMessage, ChannelAdapter } from './types.js';
import { createLogger } from '../../lib/logger.js';
import { toMessage } from '../../lib/error.js';
import { parseChannelTarget } from '../../lib/session-key.js';
import { expandLinks } from './link-expand.js';
import { StatusReactionController } from './status-reactions.js';

const log = createLogger('channels-pipeline');

export interface PipelineSession {
  adapter: ChannelAdapter;
  reactionController?: StatusReactionController;
  replied: boolean;   // true if agent called channel.send
  completed?: boolean; // true once agent.onCompleted handled it — guards against double-send
}

export class InboundMessagePipeline {
  constructor(
    private readonly bus: Bus,
    private readonly config: AppConfig,
  ) { }

  /** Seal the reaction (done/error) and stop the typing indicator. Shared with onAgentCompleted. */
  finalize(session: PipelineSession, sessionKey: string, success: boolean): void {
    if (session.reactionController) {
      if (success) session.reactionController.setDone();
      else session.reactionController.setError();
      session.reactionController.dispose();
    }
    session.adapter.stopTyping(sessionKey, true);
  }

  /**
   * Process a normalized inbound message through the policy pipeline.
   * Handles: link expansion, whitelist checking, agent execution, typing indicators.
   */
  async process(
    sessionKey: string,
    message: NormalizedInboundMessage,
    adapter: ChannelAdapter,
    activeSessions: Map<string, PipelineSession>,
  ): Promise<void> {
    const target = parseChannelTarget(sessionKey);
    if (!target) {
      log.debug(`invalid session key: ${sessionKey}`);
      return;
    }

    const channelEntry = this.config.channels.find(c => c.id === target.channel);
    if (!channelEntry) {
      log.debug(`no channel entry for: ${target.channel}`);
      return;
    }

    // Expand links in text content
    let enrichedContent = message.text || '';
    if (enrichedContent) {
      enrichedContent = await expandLinks(enrichedContent, this.config.linkExpand).catch(() => enrichedContent);
    }

    // Extract execution-relevant fields from channel config
    const cwd = channelEntry.cwd;
    const model = channelEntry.model;

    // Delegate execution decision to adapter (handles whitelist + mention logic)
    const shouldExecute = adapter.shouldExecute(message.fromUserId, message.chatType, message.isMentioned);

    if (!shouldExecute) {
      const reason = message.chatType === 'private' ? 'not whitelisted' : (message.isMentioned ? 'not whitelisted' : 'not mentioned');
      log.debug(`shouldExecute=false: userId=${message.fromUserId} chatType=${message.chatType} isMentioned=${message.isMentioned}`);
      log.info(`← ${sessionKey} (skip: ${reason}) "${enrichedContent.slice(0, 80)}"`);
      this.bus.call('agent.appendMessage', {
        sessionKey,
        content: enrichedContent,
      }).catch(err => log.error(`failed to append message: ${toMessage(err)}`));
      return;
    }

    adapter.startTyping(sessionKey, true);

    // If a run is already in flight for this chat, steer the new message into it: pi injects it
    // into the active session. Don't create a competing session/completion handler — a single
    // sessionKey has one activeSessions slot, and a second run racing cleanup is what dropped
    // replies (its agent.execute can settle early under steering while the real run continues).
    if (activeSessions.has(sessionKey)) {
      log.info(`← ${sessionKey} (steer) "${enrichedContent.slice(0, 80)}"`);
      this.bus.call('agent.execute', { sessionKey, task: enrichedContent, ...(cwd && { cwd }), ...(model && { model }) })
        .catch(err => log.error(`steered agent.execute failed: ${toMessage(err)}`));
      return;
    }

    const messageId = adapter.extractLatestMessageId(target.userId);
    let reactionController: StatusReactionController | undefined;
    if (adapter.react && messageId) {
      reactionController = new StatusReactionController(
        { react: adapter.react.bind(adapter) },
        sessionKey,
        messageId,
      );
      reactionController.setThinking();
    }

    const session: PipelineSession = { adapter, reactionController, replied: false };
    activeSessions.set(sessionKey, session);

    log.info(`← ${sessionKey} "${enrichedContent.slice(0, 80)}"`);

    // Cleanup is owned by onAgentCompleted (pi's agent_end fires once at the true end of the
    // run, even under steering where a second message's agent.execute settles early). This catch
    // only covers a rejection that arrives WITHOUT a completion event (a pre-execution failure),
    // guarded by `completed` so it never double-sends or fights onAgentCompleted's cleanup.
    this.bus.call('agent.execute', {
      sessionKey,
      task: enrichedContent,
      ...(cwd && { cwd }),
      ...(model && { model }),
    }).catch(err => {
      if (session.completed) return;
      const errorMsg = toMessage(err);
      log.error(`agent execution failed before completion: ${errorMsg}`);
      this.finalize(session, sessionKey, false);
      if (activeSessions.get(sessionKey) === session) activeSessions.delete(sessionKey);
      this.bus.call('channel.send', { sessionKey, text: `System error: ${errorMsg}` })
        .catch(sendErr => log.error(`failed to send error message: ${toMessage(sendErr)}`));
    });
  }

}
