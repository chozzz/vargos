import { describe, it, expect, beforeAll } from 'vitest';
import { bashTool } from './bash.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('bashTool', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should execute bash commands successfully', async () => {
    const result = await bashTool.execute({
      context: {
        command: 'echo "Hello Bash"',
      },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello Bash');
  });

  it('should execute commands and return output', async () => {
    const result = await bashTool.execute({
      context: {
        command: 'pwd',
      },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(typeof result.output).toBe('string');
  });
});
