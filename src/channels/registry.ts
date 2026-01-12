/**
 * Channel adapter registry
 * Manages lifecycle of all active channel adapters
 */

import type { ChannelAdapter, ChannelType } from './types.js';

export class ChannelRegistry {
  private adapters = new Map<ChannelType, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.initialize();
      await adapter.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.stop();
    }
  }
}

let globalRegistry: ChannelRegistry | null = null;

export function getChannelRegistry(): ChannelRegistry {
  if (!globalRegistry) {
    globalRegistry = new ChannelRegistry();
  }
  return globalRegistry;
}
