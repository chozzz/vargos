import { describe, it, expect, beforeAll } from 'vitest';
import { getEnvTool } from './get-env.tool';
import { setEnvTool } from './set-env.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('getEnvTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should validate input schema', () => {
    const validInput = { key: 'TEST_VAR' };
    const result = getEnvTool.inputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
      value: 'test_value',
    };

    const result = getEnvTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should get existing environment variable', async () => {
    // Set a test variable first
    await setEnvTool.execute({
      context: { key: 'TEST_GET_VAR', value: 'test_value_123' },
      runtimeContext: {} as any,
    });

    // Get the variable
    const result = await getEnvTool.execute({
      context: { key: 'TEST_GET_VAR' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('test_value_123');
  });

  it('should return undefined for non-existent variable', async () => {
    const result = await getEnvTool.execute({
      context: { key: 'NON_EXISTENT_VAR_12345' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it('should handle underscores and numbers in variable names', async () => {
    const testKey = 'TEST_VAR_WITH_NUMBERS_123';
    const testValue = 'value_with_underscores_and_numbers_456';

    await setEnvTool.execute({
      context: { key: testKey, value: testValue },
      runtimeContext: {} as any,
    });

    const result = await getEnvTool.execute({
      context: { key: testKey },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe(testValue);
  });

  it('should handle repeated get operations', async () => {
    // Set a variable first
    await setEnvTool.execute({
      context: { key: 'TEST_REPEATED', value: 'repeated_value' },
      runtimeContext: {} as any,
    });

    // Get it multiple times
    const result1 = await getEnvTool.execute({
      context: { key: 'TEST_REPEATED' },
      runtimeContext: {} as any,
    });

    const result2 = await getEnvTool.execute({
      context: { key: 'TEST_REPEATED' },
      runtimeContext: {} as any,
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.value).toBe(result2.value);
  });
});
