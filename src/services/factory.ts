/**
 * Service Factory
 * Creates service instances based on configuration
 * Allows switching between file-based, Qdrant, and Postgres implementations
 */

import path from 'node:path';
import os from 'node:os';
import {
  type IMemoryService,
  type ISessionService,
  type IVectorService,
  type ServiceConfig,
} from '../core/services/types.js';
import { FileMemoryService } from './memory/file.js';
import { QdrantMemoryService } from './memory/qdrant.js';
import { FileSessionService } from './sessions/file.js';
import { PostgresSessionService } from './sessions/postgres.js';
import { MemoryContext, initializeMemoryContext, getMemoryContext } from './memory/context.js';

export class ServiceFactory {
  private config: ServiceConfig;

  constructor(config: ServiceConfig = {}) {
    this.config = config;
  }

  createMemoryService(): IMemoryService {
    const type = this.config.memory ?? 'file';

    switch (type) {
      case 'file':
        return new FileMemoryService({
          baseDir: this.config.fileMemoryDir ?? path.join(os.homedir(), '.vargos', 'memory'),
        });

      case 'qdrant':
        if (!this.config.qdrantUrl) {
          throw new Error('QDRANT_URL required for qdrant memory backend');
        }
        return new QdrantMemoryService({
          url: this.config.qdrantUrl,
          apiKey: this.config.qdrantApiKey,
          openaiApiKey: this.config.openaiApiKey,
        });

      case 'postgres':
        throw new Error('Postgres memory backend not yet implemented. Use file or qdrant.');

      default:
        throw new Error(`Unknown memory backend: ${type}`);
    }
  }

  createSessionService(): ISessionService {
    const type = this.config.sessions ?? 'file';

    switch (type) {
      case 'file':
        return new FileSessionService({
          baseDir: this.config.fileMemoryDir ?? path.join(os.homedir(), '.vargos'),
        });

      case 'postgres':
        if (!this.config.postgresUrl) {
          throw new Error('POSTGRES_URL required for postgres session backend');
        }
        return new PostgresSessionService({
          url: this.config.postgresUrl,
        });

      default:
        throw new Error(`Unknown session backend: ${type}`);
    }
  }

  createVectorService(): IVectorService | null {
    const type = this.config.vector ?? 'none';
    if (type === 'none') return null;
    throw new Error(`Unknown vector backend: ${type}`);
  }

  async createMemoryContext(): Promise<MemoryContext> {
    // fileMemoryDir is the base dir, memory lives in <base>/memory
    const baseDir = this.config.fileMemoryDir ?? path.join(os.homedir(), '.vargos');
    const memoryDir = path.join(baseDir, 'memory');
    const sessionsDir = this.config.sessions === 'file' ? path.join(baseDir, 'sessions') : undefined;

    return initializeMemoryContext({
      memoryDir,
      cacheDir: path.join(baseDir, 'cache'),
      embeddingProvider: this.config.openaiApiKey ? 'openai' : 'none',
      openaiApiKey: this.config.openaiApiKey,
      chunkSize: 400,
      chunkOverlap: 80,
      hybridWeight: { vector: 0.7, text: 0.3 },
      // Enable SQLite persistence for embeddings
      sqlite: {
        dbPath: path.join(baseDir, 'memory.db'),
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
  vector: IVectorService | null;
  memoryContext: MemoryContext;
}

let globalServices: ServiceProvider | null = null;

export async function initializeServices(config: ServiceConfig): Promise<ServiceProvider> {
  const factory = new ServiceFactory(config);
  
  const memory = factory.createMemoryService();
  const sessions = factory.createSessionService();
  const vector = factory.createVectorService();
  const memoryContext = await factory.createMemoryContext();

  await memory.initialize();
  await sessions.initialize();
  await vector?.initialize();

  globalServices = { memory, sessions, vector, memoryContext };
  return globalServices;
}

export function getServices(): ServiceProvider {
  if (!globalServices) {
    throw new Error('Services not initialized. Call initializeServices() first.');
  }
  return globalServices;
}

export function getMemoryService(): IMemoryService {
  return getServices().memory;
}

export function getSessionService(): ISessionService {
  return getServices().sessions;
}

export function getVectorService(): IVectorService | null {
  return getServices().vector;
}

export function getMemoryContext(): import('./memory/context.js').MemoryContext {
  return getServices().memoryContext;
}

export async function closeServices(): Promise<void> {
  if (globalServices) {
    await globalServices.memory.close();
    await globalServices.sessions.close();
    await globalServices.vector?.close();
    await globalServices.memoryContext.close();
    globalServices = null;
  }
}
