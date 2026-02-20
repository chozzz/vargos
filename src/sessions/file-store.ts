/**
 * File-based Session Service
 * JSONL session storage, no external dependencies
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { glob } from 'tinyglobby';
import {
  type ISessionService,
  type Session,
  type SessionMessage,
} from './types.js';

export interface FileSessionConfig {
  baseDir: string;
}

interface SessionFile {
  session: Session;
  messages: SessionMessage[];
}

export class FileSessionService extends EventEmitter implements ISessionService {
  name = 'file';
  events = this;
  private config: FileSessionConfig;
  private sessionsDir: string;

  constructor(config: FileSessionConfig) {
    super();
    this.config = config;
    this.sessionsDir = path.join(config.baseDir, 'sessions');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await this.migrateFlat();
  }

  private async migrateFlat(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.sessionsDir);
    } catch { return; }

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const fullPath = path.join(this.sessionsDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat?.isFile()) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const firstLine = content.split('\n')[0];
        if (!firstLine) continue;
        const meta = JSON.parse(firstLine) as { sessionKey?: string };
        if (!meta.sessionKey) continue;

        const newPath = this.getSessionPath(meta.sessionKey);
        if (fullPath === newPath) continue;

        await fs.mkdir(path.dirname(newPath), { recursive: true });
        await fs.rename(fullPath, newPath);
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  async close(): Promise<void> {
    // Nothing to close for file-based
    this.removeAllListeners();
  }

  private getSessionPath(sessionKey: string): string {
    const subIdx = sessionKey.indexOf(':subagent:');
    const sanitize = (s: string) => s.replace(/:/g, '-');

    if (subIdx >= 0) {
      const rootKey = sessionKey.slice(0, subIdx);
      const subPart = sessionKey.slice(subIdx + 1); // "subagent:1234-abc"
      return path.join(this.sessionsDir, sanitize(rootKey), `${sanitize(subPart)}.jsonl`);
    }

    const safe = sanitize(sessionKey);
    return path.join(this.sessionsDir, safe, `${safe}.jsonl`);
  }

  private async loadSession(sessionKey: string): Promise<SessionFile | null> {
    const filePath = this.getSessionPath(sessionKey);
    
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      // File doesn't exist or other read error
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }

    const lines = content.trim().split('\n').filter(Boolean);
    
    if (lines.length === 0) return null;

    const rawSession = JSON.parse(lines[0]) as Session;
    if (!rawSession.sessionKey) return null; // Not a valid session file

    const session: Session = {
      ...rawSession,
      createdAt: new Date(rawSession.createdAt),
      updatedAt: new Date(rawSession.updatedAt),
    };

    const messages = lines.slice(1)
      .map(line => {
        const rawMsg = JSON.parse(line) as SessionMessage;
        if (!rawMsg.role) return null; // Skip non-message lines (e.g. Pi SDK format)
        return { ...rawMsg, timestamp: new Date(rawMsg.timestamp) };
      })
      .filter((m): m is SessionMessage => m !== null);

    return { session, messages };
  }

  private async saveSession(sessionKey: string, data: SessionFile): Promise<void> {
    const filePath = this.getSessionPath(sessionKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const lines = [
      JSON.stringify(data.session),
      ...data.messages.map(m => JSON.stringify(m)),
    ];
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
  }

  async create(session: Omit<Session, 'createdAt' | 'updatedAt'>): Promise<Session> {
    const existing = await this.loadSession(session.sessionKey);
    if (existing) {
      throw new Error(`Session already exists: ${session.sessionKey}`);
    }

    const now = new Date();
    const fullSession: Session = {
      ...session,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveSession(session.sessionKey, {
      session: fullSession,
      messages: [],
    });

    this.emit('session.created', { session: fullSession });
    return fullSession;
  }

  async get(sessionKey: string): Promise<Session | null> {
    const data = await this.loadSession(sessionKey);
    return data?.session ?? null;
  }

  async update(sessionKey: string, updates: Partial<Session>): Promise<Session | null> {
    const data = await this.loadSession(sessionKey);
    if (!data) return null;

    const updatedSession: Session = {
      ...data.session,
      ...updates,
      sessionKey, // Don't allow changing key
      updatedAt: new Date(),
    };

    await this.saveSession(sessionKey, {
      ...data,
      session: updatedSession,
    });

    this.emit('session.updated', { session: updatedSession });
    return updatedSession;
  }

  async delete(sessionKey: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionKey);
    try {
      await fs.unlink(filePath);
      await fs.rmdir(path.dirname(filePath)).catch(() => {});
      this.emit('session.deleted', { sessionKey });
      return true;
    } catch {
      return false;
    }
  }

  async list(options: { kind?: Session['kind']; limit?: number } = {}): Promise<Session[]> {
    const files = await glob('**/*.jsonl', { cwd: this.sessionsDir, absolute: true });
    const sessions: Session[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      const rawSession = JSON.parse(lines[0]) as Session;
      const session: Session = {
        ...rawSession,
        createdAt: new Date(rawSession.createdAt),
        updatedAt: new Date(rawSession.updatedAt),
      };
      if (options.kind && session.kind !== options.kind) continue;
      
      sessions.push(session);
    }

    // Sort by updatedAt descending
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (options.limit) {
      return sessions.slice(0, options.limit);
    }

    return sessions;
  }

  async addMessage(message: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<SessionMessage> {
    const fullMessage: SessionMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
    };

    const data = await this.loadSession(message.sessionKey);
    if (!data) {
      throw new Error(`Session not found: ${message.sessionKey}`);
    }

    data.messages.push(fullMessage);
    data.session.updatedAt = new Date();

    await this.saveSession(message.sessionKey, data);
    this.emit('message.added', { message: fullMessage, sessionKey: message.sessionKey });

    return fullMessage;
  }

  async getMessages(
    sessionKey: string,
    options: { limit?: number; before?: Date } = {}
  ): Promise<SessionMessage[]> {
    const data = await this.loadSession(sessionKey);
    if (!data) return [];

    let messages = data.messages;

    if (options.before) {
      const before = options.before.getTime();
      messages = messages.filter(m => m.timestamp.getTime() < before);
    }

    // Sort by timestamp descending
    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      messages = messages.slice(0, options.limit);
    }

    return messages.reverse(); // Return oldest first
  }
}
