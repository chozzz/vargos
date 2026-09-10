/**
 * Terminal backend factory.
 *
 * `createTerminalBackend(spec)` returns the backend implementation for a
 * parsed channel `cwd` spec. Local backends are plain node:fs; remote
 * backends plug in here as new `kind`s are implemented (ssh is slice 3 —
 * see docs/ROADMAP.md "Terminal backends").
 */

import type { TerminalSpec } from '../../../lib/terminal.js';
import { LocalBackend } from './local.js';
import { SshBackend } from './ssh.js';
import type { TerminalBackend } from './types.js';

export function createTerminalBackend(spec: TerminalSpec): TerminalBackend {
  switch (spec.kind) {
    case 'local':
      return new LocalBackend(spec);
    case 'ssh':
      return new SshBackend(spec);
  }
}

export type { TerminalBackend } from './types.js';
export { LocalBackend } from './local.js';
export { SshBackend } from './ssh.js';
export { createRemoteGrepToolDefinition } from './remote-grep.js';
