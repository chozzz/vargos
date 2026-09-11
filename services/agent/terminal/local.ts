/**
 * Local terminal backend — plain node:fs implementations of the Pi SDK
 * operations interfaces. This is today's behavior expressed through the
 * TerminalBackend seam: local channels keep the Pi built-in tools, and this
 * backend exists so the seam is uniform and testable (and ready for a future
 * mode where local sessions also go through explicit operations).
 */

import { globSync } from 'node:fs';
import { access, constants, mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createLocalBashOperations } from '@earendil-works/pi-coding-agent';
import type { LocalTerminalSpec } from '../../../lib/terminal.js';
import { detectImageMimeType } from './image-mime.js';
import type { TerminalBackend } from './types.js';

export class LocalBackend implements TerminalBackend {
  constructor(readonly spec: LocalTerminalSpec) {}

  readonly bash = createLocalBashOperations();

  readonly read = {
    readFile: (p: string) => readFile(p),
    access: (p: string) => access(p, constants.R_OK),
    detectImageMimeType: async (p: string) => {
      const fd = await open(p, 'r');
      try {
        const head = Buffer.alloc(12);
        const { bytesRead } = await fd.read(head, 0, head.length, 0);
        return detectImageMimeType(head.subarray(0, bytesRead));
      } finally {
        await fd.close();
      }
    },
  };

  readonly write = {
    writeFile: (p: string, content: string) => writeFile(p, content, 'utf8'),
    mkdir: async (dir: string) => { await mkdir(dir, { recursive: true }); },
  };

  readonly edit = {
    readFile: this.read.readFile,
    writeFile: this.write.writeFile,
    access: this.read.access,
  };

  readonly find = {
    exists: (p: string) => stat(p).then(() => true, () => false),
    glob: (pattern: string, cwd: string, options: { ignore: string[]; limit: number }) => {
      const matches = globSync(pattern, {
        cwd,
        ...(options.ignore.length > 0 && { ignore: options.ignore }),
      });
      return matches.slice(0, options.limit);
    },
  };

  readonly ls = {
    exists: (p: string) => stat(p).then(() => true, () => false),
    stat: (p: string) => stat(p),
    readdir: (p: string) => readdir(p),
  };

  async resolveCwd(): Promise<string> {
    return this.spec.cwd;
  }

  async connect(): Promise<void> { /* no transport for local */ }
  async dispose(): Promise<void> { /* no transport for local */ }
}
