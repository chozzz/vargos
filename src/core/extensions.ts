/**
 * Extension system for Vargos
 * Extensions register tools, channels, gateway plugins, services, and cron tasks
 */

import type { Tool } from './tools/types.js';
import type { ChannelAdapter, ChannelConfig } from './channels/types.js';
import type { InputPlugin } from './gateway/types.js';
import type { IMemoryService, ISessionService, ServiceConfig } from './services/types.js';
import type { CronTask } from '../services/cron/index.js';
import type { PiAgentRuntime } from './runtime/runtime.js';

export interface VargosExtension {
  id: string;
  name: string;
  register(ctx: ExtensionContext): void | Promise<void>;
}

export interface ExtensionContext {
  registerTool(tool: Tool): void;
  registerChannel(type: string, factory: ChannelFactory): void;
  registerGatewayPlugin(plugin: InputPlugin): void;
  registerMemoryService(factory: MemoryServiceFactory): void;
  registerSessionService(factory: SessionServiceFactory): void;
  registerCronTask(task: Omit<CronTask, 'id'>): void;
  getServices(): { memory: IMemoryService; sessions: ISessionService };
  getRuntime(): PiAgentRuntime;
  paths: { dataDir: string; workspaceDir: string };
}

export type ChannelFactory = (config: ChannelConfig) => ChannelAdapter;
export type MemoryServiceFactory = (config: ServiceConfig) => IMemoryService;
export type SessionServiceFactory = (config: ServiceConfig) => ISessionService;
