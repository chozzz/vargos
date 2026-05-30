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

    // Start typing and setup reaction controller
    adapter.startTyping(sessionKey, true);

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

    // Cleanup is anchored to the agent.execute promise, not a timer — and it cannot race
    // onAgentCompleted. pi awaits every `agent_end` listener before prompt() resolves
    // (@earendil-works/pi-agent-core agent.js), and our listener synchronously emits
    // agent.onCompleted — so onAgentCompleted has already looked up this session before
    // execute settles and `finally` runs (its reply send holds the session by closure, so the
    // delete can't affect it). Completion (success and error) is handled by onAgentCompleted;
    // this catch only covers a rejection that arrives WITHOUT a completion event (a
    // pre-execution failure), guarded by `completed` against double-send. bus.call always
    // settles (the agent caps itself at 30 min), so no timer is needed and the session can't leak.
    // NOTE: depends on pi awaiting agent_end listeners before resolving prompt(); revisit on pi bumps.
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
      this.bus.call('channel.send', { sessionKey, text: `System error: ${errorMsg}` })
        .catch(sendErr => log.error(`failed to send error message: ${toMessage(sendErr)}`));
    }).finally(() => {
      // Only remove our own entry — a newer run for the same key may have replaced it.
      if (activeSessions.get(sessionKey) === session) {
        log.debug(`session ended, cleaning up: ${sessionKey}`);
        activeSessions.delete(sessionKey);
      }
    });
  }

}
