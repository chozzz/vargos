import path from 'node:path';
import { z } from 'zod';
import { register } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import { getDataPaths } from '../../lib/paths.js';
import { MemoryContext } from './context.js';
import { MemorySQLiteStorage } from './sqlite-storage.js';
import { createLogger } from '../../lib/logger.js';

export { MemoryContext };

// Singleton — shared by MemoryService @on handlers and the tool registry
const _context: MemoryContext | null = null;

export function getMemoryContext(): MemoryContext {
  if (!_context) throw new Error('MemoryContext not initialized');
  return _context;
}

export class MemoryService {
  protected readonly log = createLogger('memory');
  protected readonly context: MemoryContext;

  constructor(private readonly bus: Bus) {
    const { workspaceDir, cacheDir, sessionsDir, dataDir } = getDataPaths();
    const storage = new MemorySQLiteStorage(path.join(dataDir, 'memory.db'));
    this.context = new MemoryContext({
      memoryDir: workspaceDir,
      cacheDir,
      sessionsDir,
      storage,
      enableFileWatcher: true
    });
  }

  async initialize(): Promise<void> {
    this.log.info('Initializing memory service');
    await this.context.initialize();
  }

  async close(): Promise<void> {
    this.log.info('Closing memory service');
    await this.context.close();
  }

  @register('memory.search', {
    description: 'Semantically search MEMORY.md + memory/*.md for relevant content.',
    schema: z.object({
      query: z.string().describe('Search query'),
      maxResults: z.number().optional().describe('Max results (default 6)'),
      minScore: z.number().optional().describe('Min relevance score 0-1 (default 0.3)'),
    }),
  })
  async search(params: EventMap['memory.search']['params']): Promise<EventMap['memory.search']['result']> {
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

  @register('memory.read', {
    description: 'Read a file from the workspace memory directory.',
    schema: z.object({
      path: z.string().describe('Relative path within workspace'),
      from: z.number().optional().describe('Start line (1-based)'),
      lines: z.number().optional().describe('Number of lines to read'),
    }),
  })
  async read(params: EventMap['memory.read']['params']): Promise<EventMap['memory.read']['result']> {
    return this.context.readFile({ relPath: params.path, from: params.from, lines: params.lines });
  }

  @register('memory.write', {
    description: 'Write or append to a file in the workspace memory directory.',
    schema: z.object({
      path: z.string().describe('Relative path within workspace'),
      content: z.string(),
      mode: z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
    }),
  })
  async write(params: EventMap['memory.write']['params']): Promise<void> {
    await this.context.writeFile(params.path, params.content, params.mode ?? 'overwrite');
  }

  @register('memory.stats', {
    description: 'Get memory index stats (file count, chunk count, last sync).',
    schema: z.object({}),
  })
  async stats(_params: EventMap['memory.stats']['params']): Promise<EventMap['memory.stats']['result']> {
    return this.context.getStats();
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const service = new MemoryService(bus);
  await service.initialize();
  bus.bootstrap(service);
  return { stop: () => service.close() };
}
