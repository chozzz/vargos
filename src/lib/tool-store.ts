import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveSessionDir } from '../config/paths.js';

export interface ToolResultEntry {
  ts: string;
  toolCallId: string;
  sessionKey: string;
  tool: string;
  args: Record<string, unknown>;
  resultChars: number;
  isError: boolean;
  /** Truncated preview (first 500 chars) */
  preview: string;
}

export async function appendToolResult(entry: ToolResultEntry): Promise<void> {
  const dir = path.join(resolveSessionDir(entry.sessionKey), 'tool-results');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${entry.toolCallId}.json`), JSON.stringify(entry), 'utf-8');
}

export function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}
