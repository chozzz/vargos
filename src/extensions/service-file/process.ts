/**
 * Process management service
 * Handles background process lifecycle (running, monitoring, cleanup)
 */

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface ProcessSession {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  exitSignal?: string;
  output: string[];
  truncated: boolean;
}

export interface ProcessOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export class ProcessService extends EventEmitter {
  private sessions = new Map<string, ProcessSession>();
  private processes = new Map<string, ChildProcessWithoutNullStreams>();
  private finishedSessions: ProcessSession[] = [];
  private maxFinishedSessions = 50;

  createSession(command: string, options: ProcessOptions): ProcessSession {
    const id = `proc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    const session: ProcessSession = {
      id,
      pid: 0,
      command,
      cwd: options.cwd,
      status: 'running',
      startedAt: Date.now(),
      output: [],
      truncated: false,
    };

    this.sessions.set(id, session);
    
    // Spawn process
    const child = spawn('bash', ['-c', command], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    session.pid = child.pid ?? 0;
    this.processes.set(id, child);

    // Handle output
    const maxOutputLines = 1000;
    
    child.stdout?.on('data', (data) => {
      this.appendOutput(id, data.toString(), maxOutputLines);
    });

    child.stderr?.on('data', (data) => {
      this.appendOutput(id, data.toString(), maxOutputLines);
    });

    // Handle exit
    child.on('close', (exitCode, signal) => {
      this.handleExit(id, exitCode, signal);
    });

    child.on('error', (err) => {
      this.handleError(id, err);
    });

    // Timeout handling
    if (options.timeoutMs) {
      setTimeout(() => {
        this.killSession(id, 'SIGTERM');
      }, options.timeoutMs);
    }

    this.emit('sessionCreated', session);
    return session;
  }

  private appendOutput(id: string, data: string, maxLines: number): void {
    const session = this.sessions.get(id);
    if (!session) return;

    const lines = data.split('\n');
    for (const line of lines) {
      if (session.output.length >= maxLines) {
        if (!session.truncated) {
          session.output.push('... (output truncated)');
          session.truncated = true;
        }
        break;
      }
      session.output.push(line);
    }
  }

  private handleExit(id: string, exitCode: number | null, signal: NodeJS.Signals | null): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = exitCode === 0 ? 'completed' : 'failed';
    session.endedAt = Date.now();
    session.exitCode = exitCode;
    if (signal) session.exitSignal = signal;

    // Move to finished
    this.sessions.delete(id);
    this.processes.delete(id);
    this.finishedSessions.unshift(session);
    
    // Trim finished list
    if (this.finishedSessions.length > this.maxFinishedSessions) {
      this.finishedSessions = this.finishedSessions.slice(0, this.maxFinishedSessions);
    }

    this.emit('sessionCompleted', session);
  }

  private handleError(id: string, err: Error): void {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = 'failed';
    session.endedAt = Date.now();
    session.output.push(`Process error: ${err.message}`);

    this.sessions.delete(id);
    this.processes.delete(id);
    this.finishedSessions.unshift(session);

    this.emit('sessionError', session, err);
  }

  getSession(id: string): ProcessSession | undefined {
    return this.sessions.get(id) ?? this.finishedSessions.find(s => s.id === id);
  }

  listRunning(): ProcessSession[] {
    return Array.from(this.sessions.values());
  }

  listFinished(): ProcessSession[] {
    return [...this.finishedSessions];
  }

  writeToSession(id: string, data: string): boolean {
    const child = this.processes.get(id);
    if (!child || !child.stdin) return false;
    
    child.stdin.write(data);
    return true;
  }

  killSession(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const child = this.processes.get(id);
    if (!child) return false;

    child.kill(signal);
    return true;
  }

  sendKeys(id: string, keys: string[]): boolean {
    // Simple key sequence encoding
    const child = this.processes.get(id);
    if (!child || !child.stdin) return false;

    for (const key of keys) {
      let sequence = key;
      // Handle special keys
      switch (key) {
        case 'Enter': sequence = '\r'; break;
        case 'Tab': sequence = '\t'; break;
        case 'Escape': sequence = '\x1b'; break;
        case 'Up': sequence = '\x1b[A'; break;
        case 'Down': sequence = '\x1b[B'; break;
        case 'Right': sequence = '\x1b[C'; break;
        case 'Left': sequence = '\x1b[D'; break;
        case 'Ctrl+C': sequence = '\x03'; break;
        case 'Ctrl+D': sequence = '\x04'; break;
        case 'Ctrl+Z': sequence = '\x1a'; break;
      }
      child.stdin.write(sequence);
    }
    return true;
  }

  removeSession(id: string): boolean {
    // Remove from both running and finished
    this.sessions.delete(id);
    this.processes.delete(id);
    const finishedIndex = this.finishedSessions.findIndex(s => s.id === id);
    if (finishedIndex >= 0) {
      this.finishedSessions.splice(finishedIndex, 1);
      return true;
    }
    return this.sessions.has(id);
  }
}

// Singleton instance
let globalProcessService: ProcessService | null = null;

export function getProcessService(): ProcessService {
  if (!globalProcessService) {
    globalProcessService = new ProcessService();
  }
  return globalProcessService;
}
