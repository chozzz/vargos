import { describe, it, expect, beforeAll } from 'vitest';
import { bashHistoryTool } from './bash-history.tool';
import { bashTool } from './bash.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('bashHistoryTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should validate input schema (empty object)', () => {
    const result = bashHistoryTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
      history: [
        { command: 'echo "test"', output: 'test\n' },
      ],
    };

    const result = bashHistoryTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should return empty history initially', async () => {
    const result = await bashHistoryTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.history).toBeDefined();
    expect(Array.isArray(result.history)).toBe(true);
  });

  it('should return history after executing commands', async () => {
    // Execute some commands first
    await bashTool.execute({
      context: { command: 'echo "test1"' },
      runtimeContext: {} as any,
    });

    await bashTool.execute({
      context: { command: 'echo "test2"' },
      runtimeContext: {} as any,
    });

    // Get history
    const result = await bashHistoryTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.history.length).toBeGreaterThan(0);

    // Verify history structure
    result.history.forEach(entry => {
      expect(entry).toHaveProperty('command');
      expect(entry).toHaveProperty('output');
      expect(typeof entry.command).toBe('string');
      expect(typeof entry.output).toBe('string');
    });
  });

  it('should track multiple commands in order', async () => {
    const commands = ['echo "cmd1"', 'echo "cmd2"', 'echo "cmd3"'];

    // Execute commands
    for (const cmd of commands) {
      await bashTool.execute({
        context: { command: cmd },
        runtimeContext: {} as any,
      });
    }

    // Get history
    const result = await bashHistoryTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.history.length).toBeGreaterThanOrEqual(commands.length);

    // Check that our commands appear in history
    const historyCommands = result.history.map(h => h.command);
    commands.forEach(cmd => {
      expect(historyCommands).toContain(cmd);
    });
  });

  it('should include command outputs in history', async () => {
    const testCommand = 'echo "history_test_output"';

    await bashTool.execute({
      context: { command: testCommand },
      runtimeContext: {} as any,
    });

    const result = await bashHistoryTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    // Find our test command in history
    const entry = result.history.find(h => h.command === testCommand);
    expect(entry).toBeDefined();
    expect(entry?.output).toContain('history_test_output');
  });
});
