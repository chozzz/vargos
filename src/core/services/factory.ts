/**
 * Service Factory
 * Creates file-based service instances for memory and sessions
 */

import path from 'node:path';
import {
  type IMemoryService,
  type ISessionService,
  type ServiceConfig,
} from './types.js';

export type { ServiceConfig };
import { FileMemoryService } from '../../extensions/service-file/memory-file.js';
import { FileSessionService } from '../../extensions/service-file/sessions-file.js';
import { MemoryContext, initializeMemoryContext } from '../../extensions/service-file/memory-context.js';
import { resolveDataDir } from '../config/paths.js';

export class ServiceFactory {
  private config: ServiceConfig;

  constructor(config: ServiceConfig = {}) {
    this.config = config;
  }

  createMemoryService(): IMemoryService {
    return new FileMemoryService({
      baseDir: this.config.fileMemoryDir ?? path.join(resolveDataDir(), 'memory'),
    });
  }

  createSessionService(): ISessionService {
    return new FileSessionService({
      baseDir: this.config.fileMemoryDir ?? resolveDataDir(),
    });
  }

  async createMemoryContext(): Promise<MemoryContext> {
    const dataDir = this.config.fileMemoryDir ?? resolveDataDir();

    // Memory indexing happens on the workspace directory (where AGENTS.md, MEMORY.md, etc. live)
    // This ensures the agent can search and recall from these context files
    const memoryDir = this.config.workspaceDir ?? path.join(dataDir, 'workspace');
    const sessionsDir = path.join(dataDir, 'sessions');

    return initializeMemoryContext({
      memoryDir,
      cacheDir: path.join(dataDir, 'cache'),
      embeddingProvider: this.config.openaiApiKey ? 'openai' : 'none',
      openaiApiKey: this.config.openaiApiKey,
      chunkSize: 400,
      chunkOverlap: 80,
      hybridWeight: { vector: 0.7, text: 0.3 },
      // Enable SQLite persistence for embeddings (stored in data dir, not workspace)
      sqlite: {
        dbPath: path.join(dataDir, 'memory.db'),
      },
      // Index session transcripts if using file-based sessions
      sessionsDir,
      // Enable file watcher for auto-reindex in dev mode
      enableFileWatcher: process.env.NODE_ENV === 'development',
    });
  }
}

// Global Service Provider
interface ServiceProvider {
  memory: IMemoryService;
  sessions: ISessionService;
  memoryContext: MemoryContext;
}

let globalServices: ServiceProvider | null = null;

export async function initializeServices(config: ServiceConfig): Promise<ServiceProvider> {
  const factory = new ServiceFactory(config);

  const memory = factory.createMemoryService();
  const sessions = factory.createSessionService();
  const memoryContext = await factory.createMemoryContext();

  await memory.initialize();
  await sessions.initialize();

  globalServices = { memory, sessions, memoryContext };
  return globalServices;
}

export function getServices(): ServiceProvider {
  if (!globalServices) {
    throw new Error('Services not initialized. Call initializeServices() first.');
  }
  return globalServices;
}

export function getSessionService(): ISessionService {
  if (standaloneSessionService) return standaloneSessionService;
  return getServices().sessions;
}

// Allows start.ts to inject session service without full initializeServices()
let standaloneSessionService: ISessionService | null = null;
export function setSessionService(service: ISessionService): void {
  standaloneSessionService = service;
}

export function getMemoryContext(): import('../../extensions/service-file/memory-context.js').MemoryContext {
  return getServices().memoryContext;
}

export async function closeServices(): Promise<void> {
  if (globalServices) {
    await globalServices.memory.close();
    await globalServices.sessions.close();
    await globalServices.memoryContext.close();
    globalServices = null;
  }
}
