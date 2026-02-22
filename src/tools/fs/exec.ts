/**
 * Shell execution tool
 * Execute shell commands with safety controls
 */

import { z } from 'zod';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const ExecParameters = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 60000)'),
});

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

/**
 * Sanitize command output for safe JSON transmission
 * - Strips ANSI escape codes (colors, cursor movements)
 * - Removes control characters except common whitespace
 * - Preserves printable text and newlines
 */
function sanitizeOutput(input: string): string {
  // Strip ANSI escape codes: ESC[...m, ESC[...H, etc.
  let sanitized = input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  // Strip other ANSI sequences (OSC, etc.)
  sanitized = sanitized.replace(/\x1b\][0-9;]*\x07/g, '');
  // Remove control characters except \n, \r, \t
  sanitized = sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // Remove null bytes and other problematic chars
  sanitized = sanitized.replace(/\x00/g, '');
  return sanitized;
}

function execCommand(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      if (stdoutTruncated) return;
      stdout += data.toString();
      if (stdout.length > 100000) {
        stdout = stdout.slice(0, 100000);
        stdoutTruncated = true;
      }
    });

    child.stderr?.on('data', (data) => {
      if (stderrTruncated) return;
      stderr += data.toString();
      if (stderr.length > 100000) {
        stderr = stderr.slice(0, 100000);
        stderrTruncated = true;
      }
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
        exitCode: exitCode ?? (killed ? -1 : 0),
        stdoutTruncated,
        stderrTruncated,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(`${stderr}\nProcess error: ${err.message}`),
        exitCode: -1,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

export const execTool: Tool = {
  name: 'exec',
  description: 'Execute a shell command in the working directory. Use with caution.',
  parameters: ExecParameters,
  formatCall: (args) => String(args.command || '').slice(0, 120),
  execute: async (args: unknown, context: ToolContext) => {
    const params = ExecParameters.parse(args);
    const timeoutMs = params.timeout ?? 60000;

    // Security: Basic command validation
    const dangerous = ['rm -rf /', '> /dev/', 'mkfs.', 'dd if='];
    for (const pattern of dangerous) {
      if (params.command.includes(pattern)) {
        return errorResult(`Command blocked for security: contains dangerous pattern '${pattern}'`);
      }
    }

    try {
      const result = await execCommand(params.command, context.workingDir, timeoutMs);
      const truncated = result.stdoutTruncated || result.stderrTruncated;

      let output = '';
      if (truncated) {
        output += '[WARNING: Output truncated at 100K chars — results may be incomplete]\n\n';
      }
      if (result.stdout) {
        output += `STDOUT:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        output += `STDERR:\n${result.stderr}\n`;
      }
      output += `Exit code: ${result.exitCode}`;

      const metadata = truncated ? { truncated: true } : undefined;

      if (result.exitCode !== 0) {
        return { content: [{ type: 'text', text: output }], isError: true, metadata };
      }

      return textResult(output, metadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Execution failed: ${message}`);
    }
  },
};
