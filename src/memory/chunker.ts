import type { MemoryChunk } from './types.js';

export interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
}

export function createChunks(
  relPath: string,
  content: string,
  mtime: Date,
  config: ChunkConfig,
): MemoryChunk[] {
  const lines = content.split('\n');
  const chunks: MemoryChunk[] = [];

  // Approximate tokens: ~4 chars per token
  const charsPerChunk = config.chunkSize * 4;
  const overlapChars = config.chunkOverlap * 4;

  let currentChunk: string[] = [];
  let currentChars = 0;
  let chunkStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk.push(line);
    currentChars += line.length + 1; // +1 for newline

    if (currentChars >= charsPerChunk) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `${relPath}:${chunkStartLine}`,
        path: relPath,
        content: chunkContent,
        startLine: chunkStartLine,
        endLine: i + 1,
        metadata: {
          date: mtime.toISOString(),
          size: chunkContent.length,
        },
      });

      const overlapLines = Math.floor(overlapChars / (currentChars / currentChunk.length));
      currentChunk = currentChunk.slice(-overlapLines);
      currentChars = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      chunkStartLine = i + 1 - currentChunk.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n');
    chunks.push({
      id: `${relPath}:${chunkStartLine}`,
      path: relPath,
      content: chunkContent,
      startLine: chunkStartLine,
      endLine: lines.length,
      metadata: {
        date: mtime.toISOString(),
        size: chunkContent.length,
      },
    });
  }

  return chunks;
}
