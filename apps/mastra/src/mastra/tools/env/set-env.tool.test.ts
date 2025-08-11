import { describe, it, expect, beforeAll } from 'vitest';
import { setEnvTool } from './set-env.tool';
import { getEnvTool } from './get-env.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('setEnvTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should validate input schema', () => {
    const validInput = { key: 'TEST_VAR', value: 'test_value' };
    const result = setEnvTool.inputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it('should reject invalid input (missing key)', () => {
    const invalidInput = { value: 'test_value' };
    const result = setEnvTool.inputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should reject invalid input (missing value)', () => {
    const invalidInput = { key: 'TEST_VAR' };
    const result = setEnvTool.inputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
    };

    const result = setEnvTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should set a new environment variable', async () => {
    const result = await setEnvTool.execute({
      context: { key: 'TEST_SET_VAR_1', value: 'value_1' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify it was set by reading it back
    const getResult = await getEnvTool.execute({
      context: { key: 'TEST_SET_VAR_1' },
      runtimeContext: {} as any,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('value_1');
  });

  it('should update an existing environment variable', async () => {
    const uniqueKey = `TEST_UPDATE_VAR_${Date.now()}`;

    // Set initial value
    await setEnvTool.execute({
      context: { key: uniqueKey, value: 'initial_value' },
      runtimeContext: {} as any,
    });

    // Update the value
    const result = await setEnvTool.execute({
      context: { key: uniqueKey, value: 'updated_value' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    // Verify the updated value
    const getResult = await getEnvTool.execute({
      context: { key: uniqueKey },
      runtimeContext: {} as any,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('updated_value');
  });

  it('should handle empty string values', async () => {
    const result = await setEnvTool.execute({
      context: { key: 'TEST_EMPTY_VAR', value: '' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    const getResult = await getEnvTool.execute({
      context: { key: 'TEST_EMPTY_VAR' },
      runtimeContext: {} as any,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe('');
  });

  it('should handle values with spaces and hyphens', async () => {
    const valueWithSpaces = 'value with spaces and-hyphens_123';

    const result = await setEnvTool.execute({
      context: { key: 'TEST_SPACES_HYPHENS', value: valueWithSpaces },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    const getResult = await getEnvTool.execute({
      context: { key: 'TEST_SPACES_HYPHENS' },
      runtimeContext: {} as any,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe(valueWithSpaces);
  });

  it('should handle URL values', async () => {
    const urlValue = 'https://api.example.com/v1/endpoint?key=value&foo=bar';

    const result = await setEnvTool.execute({
      context: { key: 'TEST_URL_VAR', value: urlValue },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    const getResult = await getEnvTool.execute({
      context: { key: 'TEST_URL_VAR' },
      runtimeContext: {} as any,
    });

    expect(getResult.success).toBe(true);
    expect(getResult.value).toBe(urlValue);
  });
});
