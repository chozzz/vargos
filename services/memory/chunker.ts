import type { MemoryChunk } from './types.js';

export interface ChunkConfig {
  chunkSize:    number;
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

  // Approximate token to character conversion (~4 chars per token)
  const approxCharsPerChunk = config.chunkSize * 4;
  const approxOverlapChars  = config.chunkOverlap * 4;

  let currentChunk: string[] = [];
  let currentChars = 0;
  let chunkStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk.push(line);
    currentChars += line.length + 1; // +1 for newline character

    if (currentChars >= approxCharsPerChunk) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id:        `${relPath}:${chunkStartLine}`,
        path:      relPath,
        content:   chunkContent,
        startLine: chunkStartLine,
        endLine:   i + 1,
        metadata:  { date: mtime.toISOString(), size: chunkContent.length },
      });

      let calculatedOverlapLines = Math.floor(approxOverlapChars / (currentChars / currentChunk.length));
      // When chunkOverlap is configured but lines are larger than the overlap
      // window, the formula rounds to zero — guarantee at least 1 overlap line.
      if (calculatedOverlapLines === 0 && config.chunkOverlap > 0 && currentChunk.length > 1) {
        calculatedOverlapLines = 1;
      }
      // slice(-0) === slice(0) returns the entire array — guard against zero overlap.
      currentChunk   = calculatedOverlapLines > 0 ? currentChunk.slice(-calculatedOverlapLines) : [];
      currentChars   = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      chunkStartLine = i + 1 - currentChunk.length + 1;
    }
  }

  // Flush remaining
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n');
    if (chunkContent.trim()) {
      chunks.push({
        id:        `${relPath}:${chunkStartLine}`,
        path:      relPath,
        content:   chunkContent,
        startLine: chunkStartLine,
        endLine:   lines.length,
        metadata:  { date: mtime.toISOString(), size: chunkContent.length },
      });
    }
  }

  return chunks;
}
