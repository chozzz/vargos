/**
 * Inbound message pipeline — core policy orchestrator for normalized messages.
 * Handles: link expansion, whitelist enforcement, agent execution flow.
 */
import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';
import type { NormalizedInboundMessage, ChannelAdapter } from './types.js';
import { StatusReactionController } from './status-reactions.js';
export interface PipelineSession {
    adapter: ChannelAdapter;
    reactionController?: StatusReactionController;
    replied: boolean;
    completed?: boolean;
}
export declare class InboundMessagePipeline {
    private readonly bus;
    private readonly config;
    constructor(bus: Bus, config: AppConfig);
    /** Seal the reaction (done/error) and stop the typing indicator. Shared with onAgentCompleted. */
    finalize(session: PipelineSession, sessionKey: string, success: boolean): void;
    /**
     * Process a normalized inbound message through the policy pipeline.
     * Handles: link expansion, whitelist checking, agent execution, typing indicators.
     */
    process(sessionKey: string, message: NormalizedInboundMessage, adapter: ChannelAdapter, activeSessions: Map<string, PipelineSession>): Promise<void>;
}
//# sourceMappingURL=pipeline.d.ts.map