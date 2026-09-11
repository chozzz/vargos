import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { parseTerminalSpec, TerminalSpecError, type TerminalSpec } from '../terminal.js';

const D = { defaultUser: 'me' };

describe('parseTerminalSpec', () => {
  describe('local specs', () => {
    it('passes plain paths through unchanged', () => {
      expect(parseTerminalSpec('/home/choz/dev/vargos')).toEqual({ kind: 'local', cwd: '/home/choz/dev/vargos' });
    });

    it('trims surrounding whitespace', () => {
      expect(parseTerminalSpec('  /home/choz/dev  ')).toEqual({ kind: 'local', cwd: '/home/choz/dev' });
    });

    it('treats a bare "ssh" value as a local path', () => {
      expect(parseTerminalSpec('ssh')).toEqual({ kind: 'local', cwd: 'ssh' });
    });

    it('treats non-ssh-prefixed values starting with "ssh" as local', () => {
      expect(parseTerminalSpec('sshproj')).toEqual({ kind: 'local', cwd: 'sshproj' });
      expect(parseTerminalSpec('./ssh-scripts')).toEqual({ kind: 'local', cwd: './ssh-scripts' });
    });
  });

  describe('ssh specs', () => {
    it('parses user@host', () => {
      expect(parseTerminalSpec('ssh user@192.0.2.5', D)).toEqual({
        kind: 'ssh', user: "user", host: '192.0.2.5', port: 22,
      });
    });

    it('parses user@host:path', () => {
      expect(parseTerminalSpec('ssh user@192.0.2.5:/home/user/apps', D)).toEqual({
        kind: 'ssh', user: "user", host: '192.0.2.5', port: 22, cwd: '/home/user/apps',
      });
    });

    it('parses -i KEY and expands ~ locally', () => {
      expect(parseTerminalSpec('ssh -i ~/.ssh/homelab user@host', D)).toEqual({
        kind: 'ssh', user: "user", host: 'host', port: 22, keyPath: `${os.homedir()}/.ssh/homelab`,
      });
    });

    it('expands a bare ~ -i key to the home directory', () => {
      expect(parseTerminalSpec('ssh -i ~ user@host', D).keyPath).toBe(os.homedir());
    });

    it('parses -p PORT', () => {
      expect(parseTerminalSpec('ssh -p 2222 user@host:/srv/app', D)).toEqual({
        kind: 'ssh', user: "user", host: 'host', port: 2222, cwd: '/srv/app',
      });
    });

    it('accepts flags in any order before the target', () => {
      const spec = parseTerminalSpec('ssh -p 2222 -i /k/key user@host:/srv/app', D) as Extract<TerminalSpec, { kind: 'ssh' }>;
      expect(spec.port).toBe(2222);
      expect(spec.keyPath).toBe('/k/key');
    });

    it('defaults the user to the given defaultUser', () => {
      expect(parseTerminalSpec('ssh 192.0.2.5:/srv/app', D).user).toBe('me');
    });

    it('defaults the user to the local username when no defaultUser is given', () => {
      expect(parseTerminalSpec('ssh 192.0.2.5').user).toBe(os.userInfo().username);
    });

    it('splits the path on the first colon only (paths may contain colons)', () => {
      expect(parseTerminalSpec('ssh u@h:a:b', D).cwd).toBe('a:b');
    });

    it('keeps a remote ~ path raw (resolved at connect time)', () => {
      expect(parseTerminalSpec('ssh u@h:~/apps', D).cwd).toBe('~/apps');
    });

    it('tolerates extra whitespace between tokens', () => {
      expect(parseTerminalSpec('  ssh   -i  /k   u@h  ', D)).toMatchObject({ kind: 'ssh', user: 'u', host: 'h', keyPath: '/k' });
    });
  });

  describe('ssh spec errors', () => {
    const cases: Array<[string, string]> = [
      ['ssh -x user@h', 'unknown flag "-x"'],
      ['ssh -i', '-i requires a KEY argument'],
      ['ssh -i -p user@h', '-i requires a KEY argument'],
      ['ssh -p user@h', 'invalid port "user@h" (expected a number)'],
      ['ssh -p 0 user@h', 'port 0 out of range'],
      ['ssh -p 99999 user@h', 'port 99999 out of range'],
      ['ssh -p', '-p requires a PORT argument'],
      ['ssh -i a -i b user@h', '-i given more than once'],
      ['ssh -p 22 -p 23 user@h', '-p given more than once'],
      ['ssh user@h extra', 'unexpected argument "extra" after target'],
      ['ssh @h', 'empty user in "@h"'],
      ['ssh user@', 'empty host in "user@"'],
      ['ssh :/x', 'empty host in ":/x"'],
      ['ssh user@h:', 'empty PATH in "user@h:"'],
    ];

    it.each(cases)(
      'rejects %s with a precise reason',
      (value, reason) => {
        expect(() => parseTerminalSpec(value, D)).toThrowError(TerminalSpecError);
        expect(() => parseTerminalSpec(value, D)).toThrow(reason);
      },
    );

    it('rejects malformed values with a message that includes the usage line', () => {
      expect(() => parseTerminalSpec('ssh -z', D)).toThrow(/expected ssh \[-i KEY\] \[-p PORT\] \[user@\]HOST\[:PATH\]/);
    });
  });
});
