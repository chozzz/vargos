/**
 * Channel service — manages external messaging adapters.
 *
 * Callable: channel.send, channel.sendMedia, channel.search, channel.get, channel.register
 * Pure events emitted: channel.onConnected, channel.onDisconnected
 * Pure events subscribed: agent.onDelta, agent.onTool, agent.onCompleted
 *
 * Inbound flow:
 *   adapter → normalizer → pipeline → expand links → whitelist check → agent.execute
 *   agent.onTool updates reaction phase
 *   agent.onCompleted stops typing + seals reaction + delivers reply
 *
 * Reply routing:
 *   - Channel-triggered: agent.onCompleted looks up activeSessions, delivers to source
 *   - Non-channel (cron, etc): agent.onCompleted ignored — caller is responsible for reply delivery
 *
 * Outbound flow: channel.send → strip markdown → chunk → adapter.send
 */
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
import type { NormalizedInboundMessage } from './types.js';
export declare class ChannelService {
    private readonly bus;
    private readonly config;
    private adapters;
    private activeSessions;
    private registry;
    private pipeline;
    constructor(bus: Bus, config: AppConfig);
    start(): Promise<void>;
    private registerProviders;
    stop(): Promise<void>;
    send(params: EventMap['channel.send']['params']): Promise<EventMap['channel.send']['result']>;
    sendMedia(params: EventMap['channel.sendMedia']['params']): Promise<EventMap['channel.sendMedia']['result']>;
    search(params: EventMap['channel.search']['params']): Promise<EventMap['channel.search']['result']>;
    get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']>;
    register(params: EventMap['channel.register']['params']): Promise<void>;
    private onAgentTool;
    private onAgentCompleted;
    /**
     * Process a normalized inbound message from an adapter.
     * Called by adapters after normalizing their raw message format.
     */
    onInboundMessage(sessionKey: string, message: NormalizedInboundMessage): Promise<void>;
    private startChannel;
    private createAdapter;
    private startAllConfigured;
}
export declare function boot(bus: Bus): Promise<{
    stop(): Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map