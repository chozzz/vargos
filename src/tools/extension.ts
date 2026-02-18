/**
 * Extension system contracts
 * Pure types — no runtime dependencies
 */

import type { Tool } from './types.js';
import type { ChannelAdapter, ChannelConfig } from '../channels/types.js';
import type { IMemoryService, ISessionService, ServiceConfig } from '../contracts/service.js';
import type { CronTask } from '../cron/types.js';

export interface VargosExtension {
  id: string;
  name: string;
  register(ctx: ExtensionContext): void | Promise<void>;
}

export type ChannelFactory = (config: ChannelConfig) => ChannelAdapter;
export type MemoryServiceFactory = (config: ServiceConfig) => IMemoryService;
export type SessionServiceFactory = (config: ServiceConfig) => ISessionService;

export interface ExtensionContext {
  registerTool(tool: Tool): void;
  registerChannel(type: string, factory: ChannelFactory): void;
  registerGatewayPlugin(plugin: { type: string; name: string }): void;
  registerMemoryService(factory: MemoryServiceFactory): void;
  registerSessionService(factory: SessionServiceFactory): void;
  registerCronTask(task: Omit<CronTask, 'id'>): void;
  getServices(): { memory: IMemoryService; sessions: ISessionService };
  getRuntime(): unknown;
  paths: { dataDir: string; workspaceDir: string };
}
