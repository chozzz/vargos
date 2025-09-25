/**
 * PostgreSQL Session Service
 * Relational storage with proper indexing
 */

import { EventEmitter } from 'node:events';
import postgres from 'postgres';
import {
  type ISessionService,
  type Session,
  type SessionMessage,
} from '../../core/services/types.js';

export interface PostgresSessionConfig {
  url: string; // postgres://user:pass@host:port/db
  schema?: string;
}

export class PostgresSessionService extends EventEmitter implements ISessionService {
  name = 'postgres';
  events = this;
  private sql: postgres.Sql | null = null;
  private config: PostgresSessionConfig;

  constructor(config: PostgresSessionConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.sql = postgres(this.config.url, {
      prepare: false, // Faster for simple queries
      onnotice: () => {}, // Suppress notices
    });

    const schema = this.config.schema ?? 'vargos';

    // Create schema
    await this.sql`CREATE SCHEMA IF NOT EXISTS ${this.sql(schema)}`;

    // Create sessions table
    await this.sql`
      CREATE TABLE IF NOT EXISTS ${this.sql(schema)}.sessions (
        session_key TEXT PRIMARY KEY,
        label TEXT,
        agent_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('main', 'subagent')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `;

    // Create messages table
    await this.sql`
      CREATE TABLE IF NOT EXISTS ${this.sql(schema)}.messages (
        id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL REFERENCES ${this.sql(schema)}.sessions(session_key) ON DELETE CASCADE,
        content TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `;

    // Create indexes
    await this.sql`CREATE INDEX IF NOT EXISTS idx_sessions_kind ON ${this.sql(schema)}.sessions(kind)`;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_sessions_updated ON ${this.sql(schema)}.sessions(updated_at DESC)`;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_messages_session ON ${this.sql(schema)}.messages(session_key)`;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON ${this.sql(schema)}.messages(timestamp DESC)`;

    // Create updated_at trigger
    await this.sql`
      CREATE OR REPLACE FUNCTION ${this.sql(schema)}.update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;

    await this.sql`
      DROP TRIGGER IF EXISTS sessions_updated_at ON ${this.sql(schema)}.sessions;
      CREATE TRIGGER sessions_updated_at
        BEFORE UPDATE ON ${this.sql(schema)}.sessions
        FOR EACH ROW
        EXECUTE FUNCTION ${this.sql(schema)}.update_updated_at()
    `;
  }

  async close(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
    this.removeAllListeners();
  }

  private get sqlClient(): postgres.Sql {
    if (!this.sql) {
      throw new Error('PostgresSessionService not initialized');
    }
    return this.sql;
  }

  private get schema(): string {
    return this.config.schema ?? 'vargos';
  }

  // ==========================================================================
  // Session CRUD
  // ==========================================================================

  async create(session: Omit<Session, 'createdAt' | 'updatedAt'>): Promise<Session> {
    const schema = this.schema;
    
    const [result] = await this.sqlClient`
      INSERT INTO ${this.sqlClient(schema)}.sessions 
        (session_key, label, agent_id, kind, metadata)
      VALUES 
        (${session.sessionKey}, ${session.label ?? null}, ${session.agentId ?? null}, ${session.kind}, ${this.sqlClient.json(session.metadata as postgres.JSONValue)})
      RETURNING session_key, label, agent_id, kind, created_at, updated_at, metadata
    `;

    const fullSession: Session = {
      sessionKey: result.session_key,
      label: result.label ?? undefined,
      agentId: result.agent_id ?? undefined,
      kind: result.kind,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      metadata: result.metadata,
    };

    this.emit('session.created', { session: fullSession });
    return fullSession;
  }

  async get(sessionKey: string): Promise<Session | null> {
    const schema = this.schema;
    
    const [result] = await this.sqlClient`
      SELECT session_key, label, agent_id, kind, created_at, updated_at, metadata
      FROM ${this.sqlClient(schema)}.sessions
      WHERE session_key = ${sessionKey}
    `;

    if (!result) return null;

    return {
      sessionKey: result.session_key,
      label: result.label ?? undefined,
      agentId: result.agent_id ?? undefined,
      kind: result.kind,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      metadata: result.metadata,
    };
  }

  async update(sessionKey: string, updates: Partial<Session>): Promise<Session | null> {
    const schema = this.schema;
    const existing = await this.get(sessionKey);
    if (!existing) return null;

    const [result] = await this.sqlClient`
      UPDATE ${this.sqlClient(schema)}.sessions
      SET 
        label = COALESCE(${updates.label ?? null}, label),
        agent_id = COALESCE(${updates.agentId ?? null}, agent_id),
        kind = COALESCE(${updates.kind ?? null}, kind),
        metadata = COALESCE(${updates.metadata ? this.sqlClient.json(updates.metadata as postgres.JSONValue) : null}, metadata)
      WHERE session_key = ${sessionKey}
      RETURNING session_key, label, agent_id, kind, created_at, updated_at, metadata
    `;

    const updatedSession: Session = {
      sessionKey: result.session_key,
      label: result.label ?? undefined,
      agentId: result.agent_id ?? undefined,
      kind: result.kind,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      metadata: result.metadata,
    };

    this.emit('session.updated', { session: updatedSession });
    return updatedSession;
  }

  async delete(sessionKey: string): Promise<boolean> {
    const schema = this.schema;
    
    const result = await this.sqlClient`
      DELETE FROM ${this.sqlClient(schema)}.sessions
      WHERE session_key = ${sessionKey}
    `;

    const deleted = result.count > 0;
    if (deleted) {
      this.emit('session.deleted', { sessionKey });
    }
    return deleted;
  }

  async list(options: { kind?: Session['kind']; limit?: number } = {}): Promise<Session[]> {
    const schema = this.schema;
    
    const results = await this.sqlClient`
      SELECT session_key, label, agent_id, kind, created_at, updated_at, metadata
      FROM ${this.sqlClient(schema)}.sessions
      WHERE ${options.kind ? this.sqlClient`kind = ${options.kind}` : this.sqlClient`TRUE`}
      ORDER BY updated_at DESC
      ${options.limit ? this.sqlClient`LIMIT ${options.limit}` : this.sqlClient``}
    `;

    return results.map(r => ({
      sessionKey: r.session_key,
      label: r.label ?? undefined,
      agentId: r.agent_id ?? undefined,
      kind: r.kind,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      metadata: r.metadata,
    }));
  }

  // ==========================================================================
  // Messaging
  // ==========================================================================

  async addMessage(message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<SessionMessage> {
    const schema = this.schema;
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    const [result] = await this.sqlClient`
      INSERT INTO ${this.sqlClient(schema)}.messages 
        (id, session_key, content, role, metadata)
      VALUES 
        (${id}, ${message.sessionKey}, ${message.content}, ${message.role}, ${this.sqlClient.json((message.metadata ?? {}) as postgres.JSONValue)})
      RETURNING id, session_key, content, role, timestamp, metadata
    `;

    // Update session updated_at
    await this.sqlClient`
      UPDATE ${this.sqlClient(schema)}.sessions
      SET updated_at = NOW()
      WHERE session_key = ${message.sessionKey}
    `;

    const fullMessage: SessionMessage = {
      id: result.id,
      sessionKey: result.session_key,
      content: result.content,
      role: result.role,
      timestamp: result.timestamp,
      metadata: result.metadata,
    };

    this.emit('message.added', { message: fullMessage, sessionKey: message.sessionKey });
    return fullMessage;
  }

  async getMessages(
    sessionKey: string,
    options: { limit?: number; before?: Date } = {}
  ): Promise<SessionMessage[]> {
    const schema = this.schema;
    
    const results = await this.sqlClient`
      SELECT id, session_key, content, role, timestamp, metadata
      FROM ${this.sqlClient(schema)}.messages
      WHERE session_key = ${sessionKey}
        AND ${options.before ? this.sqlClient`timestamp < ${options.before}` : this.sqlClient`TRUE`}
      ORDER BY timestamp ASC
      ${options.limit ? this.sqlClient`LIMIT ${options.limit}` : this.sqlClient``}
    `;

    return results.map(r => ({
      id: r.id,
      sessionKey: r.session_key,
      content: r.content,
      role: r.role,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));
  }
}
