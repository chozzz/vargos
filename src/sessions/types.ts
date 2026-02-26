/**
 * Session service types
 */

import { EventEmitter } from 'node:events';

export interface Session {
  sessionKey: string;
  label?: string;
  agentId?: string;
  kind: 'main' | 'subagent' | 'cron';
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

  create(session: Omit<Session, 'createdAt' | 'updatedAt'>): Promise<Session>;
  get(sessionKey: string): Promise<Session | null>;
  update(sessionKey: string, updates: Partial<Session>): Promise<Session | null>;
  delete(sessionKey: string): Promise<boolean>;
  list(options?: { kind?: Session['kind']; limit?: number }): Promise<Session[]>;

  addMessage(message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<SessionMessage>;
  getMessages(sessionKey: string, options?: { limit?: number; before?: Date }): Promise<SessionMessage[]>;

  initialize(): Promise<void>;
  close(): Promise<void>;
}
