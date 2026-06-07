export function createChunks(relPath, content, mtime, config) {
    const lines = content.split('\n');
    const chunks = [];
    // Approximate tokens: ~4 chars per token
    const charsPerChunk = config.chunkSize * 4;
    const overlapChars = config.chunkOverlap * 4;
    let currentChunk = [];
    let currentChars = 0;
    let chunkStartLine = 1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        currentChunk.push(line);
        currentChars += line.length + 1;
        if (currentChars >= charsPerChunk) {
            const chunkContent = currentChunk.join('\n');
            chunks.push({
                id: `${relPath}:${chunkStartLine}`,
                path: relPath,
                content: chunkContent,
                startLine: chunkStartLine,
                endLine: i + 1,
                metadata: { date: mtime.toISOString(), size: chunkContent.length },
            });
            const overlapLines = Math.floor(overlapChars / (currentChars / currentChunk.length));
            currentChunk = currentChunk.slice(-overlapLines);
            currentChars = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
            chunkStartLine = i + 1 - currentChunk.length + 1;
        }
    }
    // Flush remaining
    if (currentChunk.length > 0) {
        const chunkContent = currentChunk.join('\n');
        if (chunkContent.trim()) {
            chunks.push({
                id: `${relPath}:${chunkStartLine}`,
                path: relPath,
                content: chunkContent,
                startLine: chunkStartLine,
                endLine: lines.length,
                metadata: { date: mtime.toISOString(), size: chunkContent.length },
            });
        }
    }
    return chunks;
}
//# sourceMappingURL=chunker.js.map