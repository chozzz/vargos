/**
 * Simple session management for Vargos
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

export interface Session {
  key: string;
  agentId?: string;
  label?: string;
  createdAt: number;
  lastActivity: number;
  messages: SessionMessage[];
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export class SessionManager {
  private sessionsDir: string;
  private sessions = new Map<string, Session>();

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await this.loadSessions();
  }

  private async loadSessions(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const key = file.replace('.jsonl', '');
          await this.loadSession(key);
        }
      }
    } catch {
      // No sessions yet
    }
  }

  private async loadSession(key: string): Promise<void> {
    const filepath = path.join(this.sessionsDir, `${key}.jsonl`);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const messages: SessionMessage[] = [];
      
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          messages.push(msg);
        } catch {
          // Skip invalid lines
        }
      }

      const session: Session = {
        key,
        createdAt: messages[0]?.timestamp ?? Date.now(),
        lastActivity: messages[messages.length - 1]?.timestamp ?? Date.now(),
        messages,
      };

      this.sessions.set(key, session);
    } catch {
      // Session file doesn't exist
    }
  }

  async createSession(key: string, options?: { agentId?: string; label?: string }): Promise<Session> {
    const session: Session = {
      key,
      agentId: options?.agentId,
      label: options?.label,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messages: [],
    };

    this.sessions.set(key, session);
    await this.saveSession(key);
    return session;
  }

  getSession(key: string): Session | undefined {
    return this.sessions.get(key);
  }

  listSessions(options?: { 
    limit?: number; 
    activeMinutes?: number;
    kinds?: string[];
  }): Session[] {
    let sessions = Array.from(this.sessions.values());

    // Filter by activity
    if (options?.activeMinutes) {
      const cutoff = Date.now() - options.activeMinutes * 60 * 1000;
      sessions = sessions.filter(s => s.lastActivity >= cutoff);
    }

    // Sort by last activity
    sessions.sort((a, b) => b.lastActivity - a.lastActivity);

    // Apply limit
    if (options?.limit) {
      sessions = sessions.slice(0, options.limit);
    }

    return sessions;
  }

  async appendMessage(key: string, message: SessionMessage): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) {
      throw new Error(`Session not found: ${key}`);
    }

    session.messages.push(message);
    session.lastActivity = Date.now();
    await this.saveSession(key);
  }

  async sendMessage(key: string, content: string): Promise<void> {
    await this.appendMessage(key, {
      role: 'user',
      content,
      timestamp: Date.now(),
    });
  }

  async spawnSession(parentKey: string, task: string, options?: {
    agentId?: string;
    label?: string;
  }): Promise<string> {
    const childKey = `${parentKey}-${Date.now()}`;
    
    // Create child session
    await this.createSession(childKey, {
      agentId: options?.agentId,
      label: options?.label ?? `spawned-from-${parentKey}`,
    });

    // Add initial task message
    await this.appendMessage(childKey, {
      role: 'system',
      content: `Spawned from ${parentKey}. Task: ${task}`,
      timestamp: Date.now(),
    });

    // In a real implementation, this would start an agent process
    // For now, we just create the session structure
    return childKey;
  }

  private async saveSession(key: string): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;

    const filepath = path.join(this.sessionsDir, `${key}.jsonl`);
    const lines = session.messages.map(m => JSON.stringify(m)).join('\n');
    await fs.writeFile(filepath, lines + '\n', 'utf-8');
  }
}

// Singleton instance
let globalSessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    const sessionsDir = process.env.VARGOS_SESSIONS_DIR || 
      `${process.env.HOME}/.vargos/sessions`;
    globalSessionManager = new SessionManager(sessionsDir);
  }
  return globalSessionManager;
}
