/**
 * Core service interfaces
 * Abstract definitions for memory and sessions (file-based backends)
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  content: string;
  score: number;
  metadata: {
    path: string;
    from: number;
    to: number;
    date?: string;
    [key: string]: unknown;
  };
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  filters?: {
    dateFrom?: Date;
    dateTo?: Date;
    paths?: string[];
  };
}

// ============================================================================
// Memory Service Interface
// ============================================================================

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryWriteOptions {
  metadata?: Record<string, unknown>;
  mode?: 'append' | 'overwrite';
}

export interface IMemoryService {
  readonly name: string;

  // CRUD operations
  write(path: string, content: string, options?: MemoryWriteOptions): Promise<void>;
  read(path: string, options?: { offset?: number; limit?: number }): Promise<string>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(directory: string): Promise<string[]>;

  // Search
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Session Service Interface
// ============================================================================

export interface Session {
  sessionKey: string;
  label?: string;
  agentId?: string;
  kind: 'main' | 'subagent';
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface SessionMessage {
  id: string;
  sessionKey: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ISessionService {
  readonly name: string;
  readonly events: EventEmitter;

  // Session CRUD
  create(session: Omit<Session, 'createdAt' | 'updatedAt'>): Promise<Session>;
  get(sessionKey: string): Promise<Session | null>;
  update(sessionKey: string, updates: Partial<Session>): Promise<Session | null>;
  delete(sessionKey: string): Promise<boolean>;
  list(options?: { kind?: Session['kind']; limit?: number }): Promise<Session[]>;

  // Messaging
  addMessage(message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<SessionMessage>;
  getMessages(sessionKey: string, options?: { limit?: number; before?: Date }): Promise<SessionMessage[]>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Service Factory
// ============================================================================

export interface ServiceConfig {
  fileMemoryDir?: string;
  openaiApiKey?: string;
  workspaceDir?: string;
}
