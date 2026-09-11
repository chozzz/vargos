/**
 * Terminal backend specs.
 *
 * A channel's `cwd` config value doubles as a terminal backend spec:
 *
 *   "cwd": "/home/choz/dev/vargos"                          → local
 *   "cwd": "ssh -i ~/.ssh/id_remote user@192.0.2.10:/srv/app"  → ssh
 *
 * Grammar (the value is split on whitespace):
 *
 *   local : any value that does not start with "ssh " (a token followed by a space)
 *   ssh   : ssh [-i KEY] [-p PORT] [user@]HOST[:PATH]
 *
 * Rules:
 *   - Port is expressible only via `-p`, so `[user@]HOST[:PATH]` splits
 *     unambiguously on the first colon (no `host:2222:/path` ambiguity).
 *   - Omitted PATH → remote `$HOME` (resolved when the backend connects).
 *   - `~` in KEY is expanded to the local home directory at parse time.
 *   - `~` in PATH is kept raw and resolved on the remote host at connect time.
 *   - `-i KEY` and `-p PORT` each appear at most once, in any order, before the target.
 *   - Omitted user defaults to the local username.
 *   - A bare "ssh" value (no second token) is treated as a local path so
 *     existing configs with a literal directory named `ssh` keep working.
 *
 * This module is pure (no I/O besides reading the home dir / username for
 * defaults) and has no dependency on the Pi SDK — backend implementations live
 * in `services/agent/terminal/`.
 */

import os from 'node:os';
import path from 'node:path';

export const SSH_DEFAULT_PORT = 22;

export type LocalTerminalSpec = {
  kind: 'local';
  /** Working directory on the gateway host (the value as configured). */
  cwd: string;
};

export type SshTerminalSpec = {
  kind: 'ssh';
  /** Remote user (defaults to the local username when omitted). */
  user: string;
  host: string;
  port: number;
  /** Private key path (~ expanded to the local home; undefined → ssh-agent / default keys). */
  keyPath?: string;
  /** Remote working directory (~ kept raw); undefined → remote $HOME. */
  cwd?: string;
};

export type TerminalSpec = LocalTerminalSpec | SshTerminalSpec;

export const SSH_USAGE = 'ssh [-i KEY] [-p PORT] [user@]HOST[:PATH]';

export class TerminalSpecError extends Error {
  constructor(value: string, reason: string) {
    super(`invalid terminal spec ${JSON.stringify(value)}: ${reason} (expected ${SSH_USAGE})`);
    this.name = 'TerminalSpecError';
  }
}

export interface ParseTerminalOptions {
  /** User to assume when the target omits one. Default: local username. */
  defaultUser?: string;
}

/**
 * Parse a channel `cwd` value into a terminal backend spec.
 * Throws TerminalSpecError on a malformed `ssh …` value.
 */
export function parseTerminalSpec(value: string, options?: ParseTerminalOptions): TerminalSpec {
  const trimmed = value.trim();
  const tokens = trimmed.split(/\s+/);

  if (tokens[0] !== 'ssh' || tokens.length === 1) {
    return { kind: 'local', cwd: trimmed };
  }

  let keyPath: string | undefined;
  let port = SSH_DEFAULT_PORT;
  let portSet = false;
  let target: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (target !== undefined) {
      throw new TerminalSpecError(value, `unexpected argument ${JSON.stringify(tok)} after target`);
    }
    if (tok === '-i') {
      if (keyPath !== undefined) {
        throw new TerminalSpecError(value, '-i given more than once');
      }
      const key = tokens[++i];
      if (key === undefined || key.startsWith('-')) {
        throw new TerminalSpecError(value, '-i requires a KEY argument');
      }
      keyPath = expandHome(value, key);
    } else if (tok === '-p') {
      if (portSet) {
        throw new TerminalSpecError(value, '-p given more than once');
      }
      const rawPort = tokens[++i];
      if (rawPort === undefined) {
        throw new TerminalSpecError(value, '-p requires a PORT argument');
      }
      if (!/^\d+$/.test(rawPort)) {
        throw new TerminalSpecError(value, `invalid port ${JSON.stringify(rawPort)} (expected a number)`);
      }
      port = Number(rawPort);
      if (port < 1 || port > 65535) {
        throw new TerminalSpecError(value, `port ${port} out of range (1-65535)`);
      }
      portSet = true;
    } else if (tok.startsWith('-')) {
      throw new TerminalSpecError(value, `unknown flag ${JSON.stringify(tok)}`);
    } else {
      target = tok;
    }
  }

  if (target === undefined) {
    throw new TerminalSpecError(value, 'missing target (user@host or user@host:PATH)');
  }

  const { user, host, cwd } = parseTarget(value, target, options?.defaultUser ?? os.userInfo().username);
  return { kind: 'ssh', user, host, port, ...(keyPath !== undefined && { keyPath }), ...(cwd !== undefined && { cwd }) };
}

/** Split `[user@]HOST[:PATH]` on the last `@` and the first `:`. */
function parseTarget(value: string, target: string, defaultUser: string): { user: string; host: string; cwd?: string } {
  const at = target.lastIndexOf('@');
  let user: string | undefined;
  let rest = target;
  if (at !== -1) {
    user = target.slice(0, at);
    if (user === '') {
      throw new TerminalSpecError(value, `empty user in ${JSON.stringify(target)}`);
    }
    rest = target.slice(at + 1);
  }

  let host = rest;
  let cwd: string | undefined;
  const colon = rest.indexOf(':');
  if (colon !== -1) {
    host = rest.slice(0, colon);
    cwd = rest.slice(colon + 1);
    if (cwd === '') {
      throw new TerminalSpecError(value, `empty PATH in ${JSON.stringify(target)} (omit the trailing colon to use the remote $HOME)`);
    }
  }

  if (host === '') {
    throw new TerminalSpecError(value, `empty host in ${JSON.stringify(target)}`);
  }

  return { user: user ?? defaultUser, host, ...(cwd !== undefined && { cwd }) };
}

/** Expand a leading `~` to the local home directory; other values pass through. */
function expandHome(value: string, p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}
