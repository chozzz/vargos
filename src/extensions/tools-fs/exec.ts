/**
 * Shell execution tool
 * Execute shell commands with safety controls
 */

import { z } from 'zod';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { Tool, ToolContext, textResult, errorResult } from '../../core/tools/types.js';

const ExecParameters = z.object({
  command: z.string().describe('Shell command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default: 60000)'),
});

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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

    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      // Truncate if too large
      if (stdout.length > 100000) {
        stdout = stdout.slice(0, 100000) + '\n... (truncated)';
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      // Truncate if too large
      if (stderr.length > 100000) {
        stderr = stderr.slice(0, 100000) + '\n... (truncated)';
      }
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? (killed ? -1 : 0),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: `${stderr}\nProcess error: ${err.message}`,
        exitCode: -1,
      });
    });
  });
}

export const execTool: Tool = {
  name: 'exec',
  description: 'Execute a shell command in the working directory. Use with caution.',
  parameters: ExecParameters,
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

      let output = '';
      if (result.stdout) {
        output += `STDOUT:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        output += `STDERR:\n${result.stderr}\n`;
      }
      output += `Exit code: ${result.exitCode}`;

      if (result.exitCode !== 0) {
        return { content: [{ type: 'text', text: output }], isError: true };
      }

      return textResult(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Execution failed: ${message}`);
    }
  },
};
