/**
 * File-system tools: read, write, edit, exec
 * No bus calls needed — operate on Node.js fs directly.
 */

import { z } from 'zod';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { textResult, errorResult, imageResult } from './types.js';
import { toMessage } from '../../lib/error.js';
import { detectMimeType } from '../../lib/mime.js';

// ── Path resolution ──────────────────────────────────────────────────────────

function resolveFsPath(input: string, context: ToolContext): string {
  const expanded = input.startsWith('~')
    ? path.join(os.homedir(), input.slice(1))
    : input;
  return path.resolve(context.workingDir, expanded);
}

// ── read ─────────────────────────────────────────────────────────────────────

export const readTool: Tool = {
  name: 'read',
  description: 'Read file contents. Supports text and images. Use offset/limit for large files.',
  parameters: z.object({
    path:   z.string().describe('Path to the file'),
    offset: z.number().optional().describe('Start line (1-indexed)'),
    limit:  z.number().optional().describe('Max lines to read'),
  }),
  formatCall:   (args) => String(args.path || ''),
  formatResult: (r) => {
    const c = r.content[0];
    if (c?.type === 'image') return 'image';
    return c?.type === 'text' ? `${c.text.split('\n').length} lines` : '';
  },
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ path: z.string(), offset: z.number().optional(), limit: z.number().optional() })).parse(args);
    const filePath = resolveFsPath(p.path, context);
    try {
      const stat = await fsPromises.stat(filePath);
      if (!stat.isFile()) return errorResult(`Not a file: ${p.path}`);

      const buf  = await fsPromises.readFile(filePath);
      const mime = await detectMimeType(buf);
      if (mime.startsWith('image/')) {
        return imageResult(buf.toString('base64'), mime);
      }

      const content = buf.toString('utf-8');
      if (!p.offset && !p.limit) return textResult(content);

      const lines = content.split('\n');
      const start = (p.offset ?? 1) - 1;
      const end   = p.limit ? start + p.limit : lines.length;
      return textResult(lines.slice(start, end).join('\n'));
    } catch (err) {
      return errorResult(`Failed to read ${p.path}: ${toMessage(err)}`);
    }
  },
};

// ── write ────────────────────────────────────────────────────────────────────

export const writeTool: Tool = {
  name: 'write',
  description: 'Write content to a file. Creates the file if it does not exist.',
  parameters: z.object({
    path:    z.string().describe('Path to write'),
    content: z.string().describe('Content to write'),
  }),
  formatCall: (args) => String(args.path || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ path: z.string(), content: z.string() })).parse(args);
    const filePath = resolveFsPath(p.path, context);
    try {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await fsPromises.writeFile(filePath, p.content, 'utf-8');
      return textResult(`Wrote ${p.content.length} chars to ${p.path}`);
    } catch (err) {
      return errorResult(`Failed to write ${p.path}: ${toMessage(err)}`);
    }
  },
};

// ── edit ─────────────────────────────────────────────────────────────────────

export const editTool: Tool = {
  name: 'edit',
  description: 'Replace exact text in a file. The old_text must match exactly (including whitespace).',
  parameters: z.object({
    path:     z.string().describe('Path to the file'),
    old_text: z.string().describe('Exact text to replace'),
    new_text: z.string().describe('Replacement text'),
  }),
  formatCall: (args) => String(args.path || ''),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ path: z.string(), old_text: z.string(), new_text: z.string() })).parse(args);
    const filePath = resolveFsPath(p.path, context);
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      if (!content.includes(p.old_text)) {
        return errorResult(`Text not found in ${p.path}: ${p.old_text.slice(0, 50)}`);
      }
      await fsPromises.writeFile(filePath, content.replace(p.old_text, p.new_text), 'utf-8');
      return textResult(`Replaced ${p.old_text.slice(0, 30).replace(/\n/g, '\\n')}... in ${p.path}`);
    } catch (err) {
      return errorResult(`Failed to edit ${p.path}: ${toMessage(err)}`);
    }
  },
};

// ── exec ─────────────────────────────────────────────────────────────────────

function execCommand(command: string, cwd: string, timeoutMs: number): Promise<{
  stdout: string; stderr: string; exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
    });

    let stdout = '', stderr = '';
    const MAX = 100_000;
    const sanitize = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); if (stdout.length > MAX) stdout = stdout.slice(-MAX); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); if (stderr.length > MAX) stderr = stderr.slice(-MAX); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ stdout: sanitize(stdout), stderr: sanitize(stderr) + '\n[Timed out]', exitCode: -1 });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout: sanitize(stdout), stderr: sanitize(stderr), exitCode: code ?? 0 });
    });
  });
}

export const execTool: Tool = {
  name: 'exec',
  description: 'Execute a shell command. Returns stdout, stderr, and exit code.',
  parameters: z.object({
    command: z.string().describe('Shell command'),
    timeout: z.number().optional().describe('Timeout ms (default 60000)'),
  }),
  formatCall: (args) => String(args.command || '').slice(0, 80),
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const p = (z.object({ command: z.string(), timeout: z.number().optional() })).parse(args);
    try {
      const result = await execCommand(p.command, context.workingDir, p.timeout ?? 60_000);
      const parts = [];
      if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
      if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
      parts.push(`exit code: ${result.exitCode}`);
      return textResult(parts.join('\n\n'), { exitCode: result.exitCode });
    } catch (err) {
      return errorResult(`exec failed: ${toMessage(err)}`);
    }
  },
};
