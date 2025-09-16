/**
 * Process management tool - Ported from OpenClaw
 * Manage background processes: list, write, send-keys, kill
 * 
 * Architecture: Uses ProcessService for state management
 */

import { z } from 'zod';
import { BaseTool } from '../../core/tools/base.js';
import { ToolContext, ToolResult, textResult, errorResult } from '../../core/tools/types.js';
import { getProcessService, ProcessSession } from '../../services/process.js';

const ProcessAction = z.enum([
  'list', 'poll', 'write', 'send-keys', 'kill', 'remove'
]);

const ProcessParameters = z.object({
  action: ProcessAction.describe('Process action to perform'),
  sessionId: z.string().optional().describe('Session ID for target actions'),
  data: z.string().optional().describe('Data to write to stdin'),
  keys: z.array(z.string()).optional().describe('Key tokens to send (Enter, Ctrl+C, etc.)'),
  text: z.string().optional().describe('Text to paste'),
  eof: z.boolean().optional().describe('Close stdin after write'),
  signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT']).optional().describe('Signal to send on kill'),
});

function formatSession(session: ProcessSession): string {
  const runtime = session.endedAt 
    ? formatDuration(session.endedAt - session.startedAt)
    : formatDuration(Date.now() - session.startedAt);
  
  const status = session.status.padEnd(9);
  const label = session.command.length > 80 
    ? session.command.slice(0, 77) + '...' 
    : session.command;
  
  let line = `${session.id} ${status} ${runtime} :: ${label}`;
  
  if (session.exitCode !== undefined) {
    line += ` (exit: ${session.exitCode})`;
  }
  
  if (session.truncated) {
    line += ' [truncated]';
  }
  
  return line;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m${secs}s`;
}

export class ProcessTool extends BaseTool {
  constructor() {
    super({
      name: 'process',
      description: 'Manage running background processes: list, poll status, write to stdin, send keys, kill',
      parameters: ProcessParameters,
    });
  }

  async executeImpl(args: z.infer<typeof ProcessParameters>, context: ToolContext): Promise<ToolResult> {
    const service = getProcessService();

    switch (args.action) {
      case 'list': {
        const running = service.listRunning();
        const finished = service.listFinished();
        const all = [...running, ...finished].sort((a, b) => b.startedAt - a.startedAt);
        
        if (all.length === 0) {
          return textResult('No running or recent sessions.');
        }
        
        const lines = all.map(formatSession);
        return textResult(lines.join('\n'), { 
          running: running.length, 
          finished: finished.length 
        });
      }

      case 'poll': {
        if (!args.sessionId) {
          return errorResult('sessionId required for poll action');
        }
        
        const session = service.getSession(args.sessionId);
        if (!session) {
          return errorResult(`Session not found: ${args.sessionId}`);
        }

        const output = session.output.slice(-20).join('\n'); // Last 20 lines
        return textResult(output, {
          status: session.status,
          exitCode: session.exitCode,
          pid: session.pid,
          runtime: session.endedAt 
            ? session.endedAt - session.startedAt 
            : Date.now() - session.startedAt,
        });
      }

      case 'write': {
        if (!args.sessionId) {
          return errorResult('sessionId required for write action');
        }
        if (!args.data) {
          return errorResult('data required for write action');
        }

        const success = service.writeToSession(args.sessionId, args.data);
        if (!success) {
          return errorResult(`Failed to write to session: ${args.sessionId}`);
        }

        if (args.eof) {
          const proc = service.getSession(args.sessionId);
          // Close stdin not directly supported in simple implementation
        }

        return textResult(`Wrote ${args.data.length} bytes to session ${args.sessionId}`);
      }

      case 'send-keys': {
        if (!args.sessionId) {
          return errorResult('sessionId required for send-keys action');
        }
        if (!args.keys || args.keys.length === 0) {
          return errorResult('keys required for send-keys action');
        }

        const success = service.sendKeys(args.sessionId, args.keys);
        if (!success) {
          return errorResult(`Failed to send keys to session: ${args.sessionId}`);
        }

        return textResult(`Sent keys to session ${args.sessionId}: ${args.keys.join(', ')}`);
      }

      case 'kill': {
        if (!args.sessionId) {
          return errorResult('sessionId required for kill action');
        }

        const signal = args.signal ?? 'SIGTERM';
        const success = service.killSession(args.sessionId, signal);
        
        if (!success) {
          // Check if already finished
          const session = service.getSession(args.sessionId);
          if (session?.status !== 'running') {
            return textResult(`Session ${args.sessionId} is already ${session?.status ?? 'unknown'}`);
          }
          return errorResult(`Failed to kill session: ${args.sessionId}`);
        }

        return textResult(`Sent ${signal} to session ${args.sessionId}`);
      }

      case 'remove': {
        if (!args.sessionId) {
          return errorResult('sessionId required for remove action');
        }

        const removed = service.removeSession(args.sessionId);
        if (!removed) {
          return errorResult(`Session not found: ${args.sessionId}`);
        }

        return textResult(`Removed session ${args.sessionId}`);
      }

      default: {
        return errorResult(`Unknown action: ${args.action}`);
      }
    }
  }
}

// Factory function
export function createProcessTool(): ProcessTool {
  return new ProcessTool();
}
