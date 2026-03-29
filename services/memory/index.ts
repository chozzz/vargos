import path from 'node:path';
import { z } from 'zod';
import { on } from '../../gateway/decorators.js';
import type { Bus } from '../../gateway/bus.js';
import type { EventMap, MemorySearchResult } from '../../gateway/events.js';
import { getDataPaths } from '../../lib/paths.js';
import { MemoryContext } from './context.js';
import { MemorySQLiteStorage } from './sqlite-storage.js';

export { MemoryContext };

// Singleton — shared by MemoryService @on handlers and the tool registry
let _context: MemoryContext | null = null;

export function getMemoryContext(): MemoryContext {
  if (!_context) throw new Error('MemoryContext not initialized');
  return _context;
}

export class MemoryService {
  @on('memory.search', {
    description: 'Semantically search MEMORY.md + memory/*.md for relevant content.',
    schema: z.object({
      query:      z.string().describe('Search query'),
      maxResults: z.number().optional().describe('Max results (default 6)'),
      minScore:   z.number().optional().describe('Min relevance score 0-1 (default 0.3)'),
    }),
    format: (r) => {
      const res = r as MemorySearchResult[];
      return res.length ? `${res.length} results` : 'no results';
    },
  })
  async search(params: EventMap['memory.search']['params']): Promise<EventMap['memory.search']['result']> {
    const results = await getMemoryContext().search(params.query, {
      maxResults: params.maxResults,
      minScore:   params.minScore,
    });
    return results.map(r => ({
      citation:  r.citation,
      score:     r.score,
      content:   r.chunk.content,
      startLine: r.chunk.startLine,
      endLine:   r.chunk.endLine,
    }));
  }

  @on('memory.read', {
    description: 'Read a file from the workspace memory directory.',
    schema: z.object({
      path:  z.string().describe('Relative path within workspace'),
      from:  z.number().optional().describe('Start line (1-based)'),
      lines: z.number().optional().describe('Number of lines to read'),
    }),
    format: (r) => (r as { path: string; text: string }).path,
  })
  async read(params: EventMap['memory.read']['params']): Promise<EventMap['memory.read']['result']> {
    return getMemoryContext().readFile({ relPath: params.path, from: params.from, lines: params.lines });
  }

  @on('memory.write', {
    description: 'Write or append to a file in the workspace memory directory.',
    schema: z.object({
      path:    z.string().describe('Relative path within workspace'),
      content: z.string(),
      mode:    z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
    }),
    format: () => 'written',
  })
  async write(params: EventMap['memory.write']['params']): Promise<void> {
    await getMemoryContext().writeFile(params.path, params.content, params.mode ?? 'overwrite');
  }

  @on('memory.stats', {
    description: 'Get memory index stats (file count, chunk count, last sync).',
    schema: z.object({}),
    format: (r) => {
      const s = r as { files: number; chunks: number };
      return `${s.files} files, ${s.chunks} chunks`;
    },
  })
  async stats(_params: EventMap['memory.stats']['params']): Promise<EventMap['memory.stats']['result']> {
    return getMemoryContext().getStats();
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export async function boot(bus: Bus): Promise<{ stop?(): void }> {
  const { workspaceDir, cacheDir, sessionsDir } = getDataPaths();

  const storage = new MemorySQLiteStorage(path.join(cacheDir, 'memory.db'));
  const context = new MemoryContext({
    memoryDir:         workspaceDir,
    cacheDir,
    sessionsDir,
    storage,
    enableFileWatcher: true,
  });

  await context.initialize();
  _context = context;

  bus.registerService(new MemoryService());

  return { stop: () => context.close() };
}
