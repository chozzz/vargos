/**
 * Terminal backend — the seam between channel `cwd` specs and the Pi SDK's
 * pluggable built-in tool operations.
 *
 * A backend bundles the Pi SDK operations interfaces for every built-in tool
 * that can run on the backend's host:
 *
 *   bash / read / write / edit / find / ls
 *
 * `grep` is intentionally NOT part of the interface: the Pi SDK's grep tool
 * always spawns a local `rg`, and `GrepOperations` only supplements it (path
 * checks + context lines) — a remote grep would need a custom tool definition
 * (planned, see docs/ROADMAP.md "Terminal backends").
 *
 * For a local backend the operations are plain node:fs; for a remote backend
 * (ssh, docker, …) they are implemented over the backend's transport. The
 * agent service builds the Pi tool definitions from these operations and
 * registers them as custom tools with `excludeTools: allToolNames`, so a
 * remote channel's built-in tools run on the remote host while the SDK
 * session itself (session files, skills, AGENTS.md discovery) stays local.
 */

import type {
  BashOperations,
  EditOperations,
  FindOperations,
  LsOperations,
  ReadOperations,
  WriteOperations,
} from '@earendil-works/pi-coding-agent';
import type { TerminalSpec } from '../../../lib/terminal.js';

export interface TerminalBackend {
  /** The parsed spec this backend was created from. */
  readonly spec: TerminalSpec;

  /**
   * Resolve the backend's working directory. For local specs this returns the
   * configured cwd as-is; for remote specs it resolves `$HOME` / `~` on the
   * backend host. Call after `connect()` for remote backends.
   */
  resolveCwd(): Promise<string>;

  /** Establish the backend transport (no-op for local). */
  connect(): Promise<void>;

  /** Release backend resources (no-op for local). */
  dispose(): Promise<void>;

  readonly bash: BashOperations;
  readonly read: ReadOperations;
  readonly write: WriteOperations;
  readonly edit: EditOperations;
  readonly find: FindOperations;
  readonly ls: LsOperations;
}

export type {
  BashOperations,
  EditOperations,
  FindOperations,
  LsOperations,
  ReadOperations,
  WriteOperations,
};
