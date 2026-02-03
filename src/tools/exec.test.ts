/**
 * Tests for exec tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execTool } from './exec.js';
import { ToolContext, getFirstTextContent } from './types.js';

describe('exec tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-test-'));
    context = {
      sessionKey: 'test-session',
      workingDir: tempDir,
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should execute echo command', async () => {
    const result = await execTool.execute({ command: 'echo "Hello, World!"' }, context);

    expect(result.isError).toBeUndefined();
    expect(getFirstTextContent(result.content)).toContain('Hello, World!');
  });

  it('should capture exit code 0', async () => {
    const result = await execTool.execute({ command: 'exit 0' }, context);

    expect(result.isError).toBeUndefined();
    expect(getFirstTextContent(result.content)).toContain('Exit code: 0');
  });

  it('should capture non-zero exit code as error', async () => {
    const result = await execTool.execute({ command: 'exit 42' }, context);

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result.content)).toContain('Exit code: 42');
  });

  it('should capture stderr', async () => {
    const result = await execTool.execute({ command: 'echo "error" >&2' }, context);

    expect(getFirstTextContent(result.content)).toContain('STDERR:');
    expect(getFirstTextContent(result.content)).toContain('error');
  });

  it('should block dangerous commands', async () => {
    const result = await execTool.execute({ command: 'rm -rf /' }, context);

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result.content)).toContain('blocked');
  });

  it('should respect timeout', async () => {
    const result = await execTool.execute({ 
      command: 'sleep 10', 
      timeout: 100 
    }, context);

    expect(result.isError).toBe(true);
    expect(getFirstTextContent(result.content)).toContain('Exit code: -1');
  });

  it('should execute in correct working directory', async () => {
    await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');
    
    const result = await execTool.execute({ command: 'cat test.txt' }, context);

    expect(result.isError).toBeUndefined();
    expect(getFirstTextContent(result.content)).toContain('content');
  });
});
