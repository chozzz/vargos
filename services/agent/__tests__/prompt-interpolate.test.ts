import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { interpolatePrompt } from '../prompt-interpolate.js';
import { resetDataPaths } from '../../../lib/paths.js';

describe('interpolatePrompt', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.VARGOS_DATA_DIR;
    tmpDir = path.join(os.tmpdir(), `interpolate-test-${Date.now()}`);
    process.env.VARGOS_DATA_DIR = tmpDir;
    resetDataPaths();
  });

  afterEach(() => {
    process.env.VARGOS_DATA_DIR = originalEnv;
    resetDataPaths();
  });

  describe('built-in variables', () => {
    it('replaces ${WORKSPACE_DIR} with workspace path', () => {
      const result = interpolatePrompt('cd ${WORKSPACE_DIR}');
      expect(result).toBe(`cd ${path.join(tmpDir, 'workspace')}`);
    });

    it('replaces ${HOME} with home directory', () => {
      const result = interpolatePrompt('${HOME}/file');
      expect(result).toBe(`${os.homedir()}/file`);
    });

    it('replaces multiple variables in one prompt', () => {
      const result = interpolatePrompt('${WORKSPACE_DIR}/x and ${LOGS_DIR}/y');
      expect(result).toBe(
        `${path.join(tmpDir, 'workspace')}/x and ${path.join(tmpDir, 'logs')}/y`,
      );
    });

    it('replaces all occurrences of the same variable', () => {
      const result = interpolatePrompt('${HOME} ${HOME} ${HOME}');
      const home = os.homedir();
      expect(result).toBe(`${home} ${home} ${home}`);
    });
  });

  describe('context variables', () => {
    it('uses provided context values', () => {
      const result = interpolatePrompt('Hello ${FROM_USER}', {
        FROM_USER: 'Alice',
      });
      expect(result).toBe('Hello Alice');
    });

    it('falls back to "unknown" when channel context not provided', () => {
      const result = interpolatePrompt('Bot: ${BOT_NAME}');
      expect(result).toBe('Bot: unknown');
    });

    it('allows context to add custom variables', () => {
      const result = interpolatePrompt('Brand: ${BRAND}', { BRAND: 'Vargos' });
      expect(result).toBe('Brand: Vargos');
    });
  });

  describe('default values (${VAR:-default} and ${VAR:default} syntax)', () => {
    it('uses default when variable is missing', () => {
      const result = interpolatePrompt('Brand: ${BRAND:-Vargos}');
      expect(result).toBe('Brand: Vargos');
    });

    it('uses default when variable is missing (alternative syntax)', () => {
      const result = interpolatePrompt('Brand: ${BRAND:Vargos}');
      expect(result).toBe('Brand: Vargos');
    });

    it('uses context value over default when present', () => {
      const result = interpolatePrompt('Brand: ${BRAND:-Vargos}', {
        BRAND: 'CustomBrand',
      });
      expect(result).toBe('Brand: CustomBrand');
    });

    it('uses default when context value is empty string', () => {
      const result = interpolatePrompt('Brand: ${BRAND:-Vargos}', { BRAND: '' });
      expect(result).toBe('Brand: Vargos');
    });

    it('supports empty default (${VAR:-})', () => {
      const result = interpolatePrompt('Prefix=[${MISSING:-}]');
      expect(result).toBe('Prefix=[]');
    });

    it('supports defaults with spaces and punctuation', () => {
      const result = interpolatePrompt('${TONE:-friendly and helpful}');
      expect(result).toBe('friendly and helpful');
    });

    it('does not log warnings when default is used', () => {
      const result = interpolatePrompt('${MISSING:-fallback}');
      expect(result).toBe('fallback');
    });

    it('handles multiple defaults in one prompt', () => {
      const result = interpolatePrompt('${A:-one} and ${B:-two}');
      expect(result).toBe('one and two');
    });

    it('uses built-in over default for known variables', () => {
      const result = interpolatePrompt('${HOME:-/fallback}');
      expect(result).toBe(os.homedir());
    });
  });

  describe('missing variables', () => {
    it('leaves placeholder when variable is missing and no default', () => {
      const result = interpolatePrompt('Value: ${UNKNOWN_VAR}');
      expect(result).toBe('Value: ${UNKNOWN_VAR}');
    });

    it('handles mix of resolved and missing variables', () => {
      const result = interpolatePrompt('${HOME} and ${UNKNOWN_VAR}');
      expect(result).toBe(`${os.homedir()} and \${UNKNOWN_VAR}`);
    });
  });

  describe('edge cases', () => {
    it('returns prompt unchanged when no variables present', () => {
      const result = interpolatePrompt('plain text with no vars');
      expect(result).toBe('plain text with no vars');
    });

    it('ignores lowercase placeholders (only [A-Z_]+ matches)', () => {
      const result = interpolatePrompt('${lowercase} stays');
      expect(result).toBe('${lowercase} stays');
    });

    it('handles empty prompt', () => {
      expect(interpolatePrompt('')).toBe('');
    });

    it('does not interpolate within a default value (no nesting)', () => {
      const result = interpolatePrompt('${X:-${HOME}}');
      expect(result).toBe('${HOME}');
    });
  });
});
