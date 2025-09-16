/**
 * Memory system - Simplified version inspired by OpenClaw
 * Uses file-based storage with basic search
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface MemoryEntry {
  content: string;
  timestamp: number;
  tags?: string[];
}

export interface MemorySearchResult {
  path: string;
  snippet: string;
  score: number;
  startLine: number;
  endLine: number;
}

export class MemoryManager {
  private memoryDir: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.memoryDir, { recursive: true });
    await fs.mkdir(path.join(this.memoryDir, 'daily'), { recursive: true });
  }

  /**
   * Write to daily memory file
   */
  async writeDaily(content: string, date?: Date): Promise<string> {
    const d = date ?? new Date();
    const filename = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.md`;
    const filepath = path.join(this.memoryDir, 'daily', filename);
    
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n\n${content}\n`;
    
    await fs.appendFile(filepath, entry, 'utf-8');
    return filepath;
  }

  /**
   * Write to main MEMORY.md
   */
  async writeMemory(content: string): Promise<string> {
    const filepath = path.join(this.memoryDir, 'MEMORY.md');
    await fs.appendFile(filepath, `\n${content}\n`, 'utf-8');
    return filepath;
  }

  /**
   * Simple text search (no vector search for MVP)
   */
  async search(query: string, options?: { maxResults?: number; minScore?: number }): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0;
    
    const results: MemorySearchResult[] = [];
    
    try {
      // Search all .md files in memory directory
      const files = await this.listMarkdownFiles();
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        // Simple scoring: count query term occurrences
        const queryLower = query.toLowerCase();
        let score = 0;
        const matchingLines: number[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const lineLower = lines[i].toLowerCase();
          if (lineLower.includes(queryLower)) {
            score += 1;
            matchingLines.push(i);
          }
        }
        
        if (score > 0) {
          // Find contiguous blocks of matching lines
          const blocks: Array<{ start: number; end: number }> = [];
          let currentBlock: { start: number; end: number } | null = null;
          
          for (const lineNum of matchingLines) {
            if (!currentBlock || lineNum > currentBlock.end + 2) {
              if (currentBlock) blocks.push(currentBlock);
              currentBlock = { start: lineNum, end: lineNum };
            } else {
              currentBlock.end = lineNum;
            }
          }
          if (currentBlock) blocks.push(currentBlock);
          
          // Create results for each block
          for (const block of blocks) {
            const startLine = Math.max(0, block.start - 2);
            const endLine = Math.min(lines.length, block.end + 3);
            const snippet = lines.slice(startLine, endLine).join('\n');
            
            results.push({
              path: path.relative(this.memoryDir, file),
              snippet,
              score: score / lines.length, // Normalize by file length
              startLine: startLine + 1, // 1-indexed
              endLine: endLine,
            });
          }
        }
      }
      
      // Sort by score and filter
      return results
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
        
    } catch (err) {
      // Return empty if memory dir doesn't exist yet
      return [];
    }
  }

  /**
   * Read specific file with optional line range
   */
  async readFile(params: { relPath: string; from?: number; lines?: number }): Promise<{ path: string; text: string }> {
    const filepath = path.join(this.memoryDir, params.relPath);
    
    // Security: ensure within memory dir
    if (!filepath.startsWith(this.memoryDir)) {
      throw new Error('Access denied: path outside memory directory');
    }
    
    const content = await fs.readFile(filepath, 'utf-8');
    const allLines = content.split('\n');
    
    const from = (params.from ?? 1) - 1; // Convert to 0-indexed
    const lineCount = params.lines ?? allLines.length;
    
    const selectedLines = allLines.slice(from, from + lineCount);
    
    return {
      path: params.relPath,
      text: selectedLines.join('\n'),
    };
  }

  private async listMarkdownFiles(dir: string = this.memoryDir): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.listMarkdownFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not exist
    }
    
    return files;
  }
}
