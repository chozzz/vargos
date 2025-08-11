import { describe, it, expect, beforeAll } from 'vitest';
import { bashInterruptTool } from './bash-interrupt.tool';
import { bashTool } from './bash.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('bashInterruptTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should validate input schema (empty object)', () => {
    const result = bashInterruptTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
    };

    const result = bashInterruptTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should execute without error when no command is running', async () => {
    const result = await bashInterruptTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return success response structure', async () => {
    const result = await bashInterruptTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });

  // Note: Testing actual interrupt functionality is challenging due to timing
  // This would require spawning a long-running command in the background
  // and interrupting it, which is difficult to do reliably in unit tests
  it('should handle interrupt call gracefully', async () => {
    // Execute a quick command first
    await bashTool.execute({
      context: { command: 'echo "test"' },
      runtimeContext: {} as any,
    });

    // Try to interrupt (nothing should be running by now)
    const result = await bashInterruptTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
  });
});
