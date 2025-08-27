import { describe, it, expect, beforeAll } from 'vitest';
import { getEnvTool } from './get-env.tool';
import { setEnvTool } from './set-env.tool';
import { searchEnvTool } from './search-env.tool';
import { initializeCoreServices } from '../../services/core.service';

/**
 * Unified Environment Tools Integration Tests
 *
 * All env tool tests are combined into a single file to prevent parallel execution issues.
 * Tests run sequentially within this file, avoiding race conditions when accessing .env.test.
 */
describe('Environment Tools - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    // This will use .env.test because NODE_ENV=test (set in vitest.globalSetup.ts)
    await initializeCoreServices();
  });

  describe('getEnvTool', () => {
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

  describe('setEnvTool', () => {
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

  describe('searchEnvTool', () => {
    it('should validate input schema', () => {
      const validInput = { keyword: 'TEST' };
      const result = searchEnvTool.inputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate input schema with censor option', () => {
      const validInput = { keyword: 'TEST', censor: true };
      const result = searchEnvTool.inputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate output schema structure', () => {
      const validOutput = {
        success: true,
        matches: { TEST_VAR: 'value' },
      };

      const result = searchEnvTool.outputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should search for environment variables by keyword', async () => {
      // Set up test data
      await setEnvTool.execute({
        context: { key: 'TEST_SEARCH_VAR_1', value: 'value1' },
        runtimeContext: {} as any,
      });

      await setEnvTool.execute({
        context: { key: 'TEST_SEARCH_VAR_2', value: 'value2' },
        runtimeContext: {} as any,
      });

      const result = await searchEnvTool.execute({
        context: { keyword: 'TEST_SEARCH', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.matches).length).toBeGreaterThan(0);
      expect(result.matches['TEST_SEARCH_VAR_1']).toBe('value1');
      expect(result.matches['TEST_SEARCH_VAR_2']).toBe('value2');
    });

    it('should return all variables when keyword is empty', async () => {
      const result = await searchEnvTool.execute({
        context: { keyword: '', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.matches).length).toBeGreaterThan(0);
    });

    it('should censor sensitive values when censor=true', async () => {
      // Set a sensitive variable
      await setEnvTool.execute({
        context: { key: 'PROD_API_KEY', value: 'secret_key_123' },
        runtimeContext: {} as any,
      });

      const result = await searchEnvTool.execute({
        context: { keyword: 'API_KEY', censor: true },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      const censoredValue = result.matches['PROD_API_KEY'];
      expect(censoredValue).toBeDefined();
      expect(censoredValue).not.toBe('secret_key_123');
      expect(censoredValue).toContain('*');
    });

    it('should not censor when censor=false', async () => {
      await setEnvTool.execute({
        context: { key: 'PROD_API_KEY', value: 'secret_key_123' },
        runtimeContext: {} as any,
      });

      const result = await searchEnvTool.execute({
        context: { keyword: 'API_KEY', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(result.matches['PROD_API_KEY']).toBe('secret_key_123');
    });

    it('should handle empty search results', async () => {
      const result = await searchEnvTool.execute({
        context: { keyword: 'NONEXISTENT_KEYWORD_XYZ', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(Object.keys(result.matches).length).toBe(0);
    });

    it('should search by value as well as key', async () => {
      await setEnvTool.execute({
        context: { key: 'TEST_EMPTY_SEARCH', value: 'test_value' },
        runtimeContext: {} as any,
      });

      const result = await searchEnvTool.execute({
        context: { keyword: 'test_value', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(result.matches['TEST_EMPTY_SEARCH']).toBe('test_value');
    });

    it('should be case-insensitive', async () => {
      await setEnvTool.execute({
        context: { key: 'TEST_CASE_SENSITIVE', value: 'CaseSensitiveValue' },
        runtimeContext: {} as any,
      });

      const result = await searchEnvTool.execute({
        context: { keyword: 'case', censor: false },
        runtimeContext: {} as any,
      });

      expect(result.success).toBe(true);
      expect(result.matches['TEST_CASE_SENSITIVE']).toBe('CaseSensitiveValue');
    });
  });
});
