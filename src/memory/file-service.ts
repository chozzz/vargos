/**
 * File-based Memory Service
 * Simple, no external dependencies
 * Stores files in configurable directory with text-based search
 */

import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { glob } from 'tinyglobby';
import {
  type IMemoryService,
  type MemoryEntry,
  type MemoryWriteOptions,
  type SearchOptions,
  type SearchResult,
} from './types.js';

export interface FileMemoryConfig {
  baseDir: string;
}

export class FileMemoryService implements IMemoryService {
  name = 'file';
  private config: FileMemoryConfig;

  constructor(config: FileMemoryConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Ensure base directory exists
    await fs.mkdir(this.config.baseDir, { recursive: true });
  }

  async close(): Promise<void> {
    // Nothing to close for file-based
  }

  private resolvePath(filePath: string): string {
    return path.resolve(this.config.baseDir, filePath);
  }

  async write(filePath: string, content: string, options?: MemoryWriteOptions): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (options?.mode === 'append') {
      const existing = await this.read(filePath).catch(() => '');
      content = existing + content;
    }

    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async read(filePath: string, options?: { offset?: number; limit?: number }): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    if (!(await this.exists(filePath))) {
      throw new Error(`Memory file not found: ${filePath}`);
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    if (options?.offset || options?.limit) {
      const lines = content.split('\n');
      const start = options.offset ?? 0;
      const end = options.limit ? start + options.limit : lines.length;
      return lines.slice(start, end).join('\n');
    }

    return content;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    if (!(await this.exists(filePath))) {
      throw new Error(`Memory file not found: ${filePath}`);
    }
    await fs.unlink(fullPath);
  }

  async list(directory: string): Promise<string[]> {
    const fullDir = this.resolvePath(directory);
    const files = await glob('**/*.md', { cwd: fullDir, absolute: false });
    return files;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, minScore = 0 } = options;
    const files = await glob('**/*.md', { cwd: this.config.baseDir, absolute: true });

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter(t => t.length > 2);

    for (const file of files) {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;

      const relativePath = path.relative(this.config.baseDir, file);
      const stream = createReadStream(file, 'utf-8');
      const rl = createInterface({ input: stream });

      let lineNum = 0;
      let content = '';

      for await (const line of rl) {
        lineNum++;
        content += line + '\n';

        // Check every 50 lines for matches
        if (lineNum % 50 === 0 || lineNum === 1) {
          const contentLower = content.toLowerCase();
          const matches = terms.filter(term => contentLower.includes(term)).length;
          
          if (matches > 0) {
            const score = matches / terms.length;
            if (score >= minScore) {
              results.push({
                content: content.slice(0, 2000),
                score,
                metadata: {
                  path: relativePath,
                  from: Math.max(1, lineNum - 49),
                  to: lineNum,
                  date: stat.mtime.toISOString(),
                },
              });
            }
            content = '';
          }
        }
      }

      // Check remaining content
      if (content) {
        const contentLower = content.toLowerCase();
        const matches = terms.filter(term => contentLower.includes(term)).length;
        
        if (matches > 0) {
          const score = matches / terms.length;
          if (score >= minScore) {
            results.push({
              content: content.slice(0, 2000),
              score,
              metadata: {
                path: relativePath,
                from: Math.max(1, lineNum - content.split('\n').length + 1),
                to: lineNum,
                date: stat.mtime.toISOString(),
              },
            });
          }
        }
      }
    }

    // Sort by score descending and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
