import { promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { MemoryChunk } from './types.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('memory');

type EmbedFn = (text: string) => Promise<number[] | undefined>;

export async function indexSessions(
  sessionsDir: string,
  embed: EmbedFn,
): Promise<MemoryChunk[]> {
  const allChunks: MemoryChunk[] = [];
  try {
    const sessionFiles = await glob('**/*.jsonl', { cwd: sessionsDir, absolute: true });
    for (const file of sessionFiles) {
      const relPath = path.relative(sessionsDir, file);
      const chunks  = await indexSessionFile(file, relPath, embed);
      allChunks.push(...chunks);
    }
  } catch (err) {
    log.error(`failed to index sessions: ${err}`);
  }
  return allChunks;
}

async function indexSessionFile(
  filePath: string,
  relPath: string,
  embed: EmbedFn,
): Promise<MemoryChunk[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stat    = await fs.stat(filePath);
    const lines   = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return [];

    const session = JSON.parse(lines[0]) as { sessionKey?: string; label?: string };
    const chunks: MemoryChunk[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const msg = JSON.parse(lines[i]) as { role?: string; content?: string };
        if (!msg.content) continue;

        const chunk: MemoryChunk = {
          id:        `${relPath}:${i}`,
          path:      relPath,
          content:   `[${msg.role}] ${msg.content}`,
          startLine: i,
          endLine:   i,
          metadata:  {
            date:         stat.mtime.toISOString(),
            size:         msg.content.length,
            sessionKey:   session.sessionKey,
            sessionLabel: session.label,
            role:         msg.role,
          },
        };

        chunk.embedding = await embed(chunk.content);
        chunks.push(chunk);
      } catch { /* skip malformed lines */ }
    }

    return chunks;
  } catch (err) {
    log.error(`failed to index session ${filePath}: ${err}`);
    return [];
  }
}
