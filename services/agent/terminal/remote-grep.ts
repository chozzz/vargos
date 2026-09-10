/**
 * Remote grep tool — mirrors the Pi SDK's built-in grep exactly (same input
 * schema, description, and renderers) but executes `rg` ON THE REMOTE HOST
 * through the terminal backend's bash operations, and serves context lines
 * through its SFTP read operations.
 *
 * The SDK's built-in grep has no pluggable exec seam: it always resolves a
 * local `rg` binary (PATH or downloaded to pi's bin dir) and stats paths
 * locally — so it cannot search a remote tree. Pi's own remote example
 * (gondolin) hits the same wall and replaces grep's `execute` the same way
 * we do here: keep the built-in definition (schema + rendering), swap the
 * implementation.
 *
 * Registered under the same name ("grep") as a custom tool for remote
 * sessions, so it shadows the local built-in in the session's tool registry —
 * the model's tool context is identical to a local session.
 */

import { isAbsolute, join as posixJoin, relative as posixRelative } from 'node:path/posix';
import {
  createGrepToolDefinition,
  formatSize,
  truncateHead,
  truncateLine,
  DEFAULT_MAX_BYTES,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { TerminalBackend } from './types.js';

// The SDK exports the truncate helpers but not this constant (mirrors pi's value).
const GREP_MAX_LINE_LENGTH = 500;
const DEFAULT_LIMIT = 100;

interface GrepParams {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
}

interface Match {
  filePath: string;
  lineNumber: number;
  lineText?: string;
}

/** Single-quote a string for safe interpolation into a remote shell command. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build a `grep` tool definition that runs ripgrep on the backend's remote
 * host. Reuses the built-in definition's schema/description/renderers and
 * replaces only `execute`.
 */
export function createRemoteGrepToolDefinition(backend: TerminalBackend, remoteCwd: string): ToolDefinition {
  const base = createGrepToolDefinition(remoteCwd);

  return {
    ...base,
    execute: async (_toolCallId, params: unknown, signal) => {
      const { pattern, path: searchDir, glob, ignoreCase, literal, context, limit } = params as GrepParams;

      const searchPath = searchDir ? (isAbsolute(searchDir) ? searchDir : posixJoin(remoteCwd, searchDir)) : remoteCwd;

      let isDirectory: boolean;
      try {
        isDirectory = (await backend.ls.stat(searchPath)).isDirectory();
      } catch {
        return { content: [{ type: 'text', text: `Path not found: ${searchPath}` }], details: { error: 'path not found' } };
      }

      const contextValue = context && context > 0 ? context : 0;
      const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);

      const args = ['--json', '--line-number', '--color=never', '--hidden'];
      if (ignoreCase) args.push('--ignore-case');
      if (literal) args.push('--fixed-strings');
      if (glob) args.push('--glob', glob);
      args.push('--', pattern, searchPath);

      const out: Buffer[] = [];
      const { exitCode } = await backend.bash.exec(`rg ${args.map(shq).join(' ')}`, remoteCwd, {
        onData: d => out.push(d),
        signal,
      });
      const raw = Buffer.concat(out).toString('utf8');

      // rg exit codes: 0 = matches, 1 = no matches, 2 = error.
      if (exitCode !== 0 && exitCode !== 1) {
        const message = raw.split('\n').filter(l => l.trim() && !l.trim().startsWith('{')).slice(-3).join(' ').trim()
          || `ripgrep exited with code ${exitCode}`;
        return { content: [{ type: 'text', text: `Error: ${message}` }], details: { error: message } };
      }

      // Parse rg's NDJSON "match" events (same fields the built-in consumes).
      const matches: Match[] = [];
      let matchCount = 0;
      for (const line of raw.split('\n')) {
        if (!line.trim() || matchCount >= effectiveLimit) continue;
        let event: { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === 'match') {
          matchCount++;
          const filePath = event.data?.path?.text;
          const lineNumber = event.data?.line_number;
          if (filePath && typeof lineNumber === 'number') {
            matches.push({ filePath, lineNumber, lineText: event.data?.lines?.text });
          }
        }
      }

      if (matches.length === 0) {
        return { content: [{ type: 'text', text: 'No matches found' }], details: undefined };
      }

      const formatPath = (filePath: string): string => {
        if (isDirectory) {
          const rel = posixRelative(searchPath, filePath);
          if (rel && !rel.startsWith('..')) return rel;
        }
        return filePath.split('/').pop() ?? filePath;
      };

      const getFileLines = async (filePath: string): Promise<string[]> => {
        try {
          const content = (await backend.read.readFile(filePath)).toString('utf8');
          return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        } catch {
          return [];
        }
      };

      let linesTruncated = false;
      const outputLines: string[] = [];
      for (const match of matches) {
        const relativePath = formatPath(match.filePath);
        if (contextValue === 0) {
          const sanitized = (match.lineText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/\n$/, '');
          const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
          if (wasTruncated) linesTruncated = true;
          outputLines.push(`${relativePath}:${match.lineNumber}: ${truncatedText}`);
        } else {
          const lines = await getFileLines(match.filePath);
          if (lines.length === 0) {
            outputLines.push(`${relativePath}:${match.lineNumber}: (unable to read file)`);
            continue;
          }
          const start = Math.max(1, match.lineNumber - contextValue);
          const end = Math.min(lines.length, match.lineNumber + contextValue);
          for (let current = start; current <= end; current++) {
            const { text: truncatedText, wasTruncated } = truncateLine((lines[current - 1] ?? '').replace(/\r/g, ''));
            if (wasTruncated) linesTruncated = true;
            const prefix = current === match.lineNumber ? `${relativePath}:${current}:` : `${relativePath}-${current}-`;
            outputLines.push(`${prefix} ${truncatedText}`);
          }
        }
      }

      // Same byte truncation + notices as the built-in.
      const truncation = truncateHead(outputLines.join('\n'), { maxLines: Number.MAX_SAFE_INTEGER });
      let output = truncation.content;
      const notices: string[] = [];
      if (matches.length >= effectiveLimit) {
        notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
      }
      if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
      if (linesTruncated) notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`);
      if (notices.length > 0) output += `\n\n[${notices.join('. ')}]`;

      return {
        content: [{ type: 'text', text: output }],
        details: linesTruncated ? { linesTruncated: true } : undefined,
      };
    },
  } as ToolDefinition;
}
