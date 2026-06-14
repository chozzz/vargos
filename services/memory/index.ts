import path from 'node:path';
import { z } from 'zod';
import type { Bus, Service } from '../../core/types.js';
import { getDataPaths } from '../../lib/paths.js';
import { MemoryContext } from './context.js';
import { MemorySQLiteStorage } from './sqlite-storage.js';
import { createLogger } from '../../lib/logger.js';

export class MemoryService implements Service {
  readonly name = 'memory';
  protected readonly log = createLogger('memory');
  protected readonly context: MemoryContext;

  constructor() {
    const { workspaceDir, cacheDir, sessionsDir, dataDir } = getDataPaths();
    const storage = new MemorySQLiteStorage(path.join(dataDir, 'memory.db'));
    this.context = new MemoryContext({
      memoryDir: workspaceDir,
      cacheDir,
      sessionsDir,
      storage,
      enableFileWatcher: true,
    });
  }

  async init(bus: Bus): Promise<void> {
    this.log.info('Initializing memory service');
    await this.context.initialize();

    bus.register('memory.search', {
      description: 'Semantically search MEMORY.md + memory/*.md for relevant content.',
      schema: z.object({
        query: z.string().describe('Search query'),
        maxResults: z.number().optional().describe('Max results (default 6)'),
        minScore: z.number().optional().describe('Min relevance score 0-1 (default 0.3)'),
      }),
      cli: { positional: ['query'] },
    }, (p) => this.search(p));

    bus.register('memory.read', {
      description: 'Read a file from the workspace memory directory.',
      schema: z.object({
        path: z.string().describe('Relative path within workspace'),
        from: z.number().optional().describe('Start line (1-based)'),
        lines: z.number().optional().describe('Number of lines to read'),
      }),
      cli: { positional: ['path'] },
    }, (p) => this.context.readFile({ relPath: p.path, from: p.from, lines: p.lines }));

    bus.register('memory.write', {
      description: 'Write or append to a file in the workspace memory directory.',
      schema: z.object({
        path: z.string().describe('Relative path within workspace'),
        content: z.string(),
        mode: z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
      }),
      cli: { positional: ['path', 'content'] },
    }, (p) => this.context.writeFile(p.path, p.content, p.mode ?? 'overwrite'));

    bus.register('memory.stats', {
      description: 'Get memory index stats (file count, chunk count, last sync).',
      schema: z.object({}),
    }, () => this.context.getStats());
  }

  async dispose(): Promise<void> {
    this.log.info('Closing memory service');
    await this.context.close();
  }

  private async search(params: { query: string; maxResults?: number; minScore?: number }) {
    const results = await this.context.search(params.query, {
      maxResults: params.maxResults,
      minScore: params.minScore,
    });
    return results.map(r => ({
      citation: r.citation,
      score: r.score,
      content: r.chunk.content,
      startLine: r.chunk.startLine,
      endLine: r.chunk.endLine,
    }));
  }
}

export function createService(): Service {
  return new MemoryService();
}
