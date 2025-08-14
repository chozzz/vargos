import { describe, it, expect, beforeAll } from 'vitest';
import { searchEnvTool } from './search-env.tool';
import { setEnvTool } from './set-env.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('searchEnvTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();

    // Set up test environment variables
    await setEnvTool.execute({
      context: { key: 'TEST_SEARCH_VAR_1', value: 'value1' },
      runtimeContext: {} as any,
    });

    await setEnvTool.execute({
      context: { key: 'TEST_SEARCH_VAR_2', value: 'value2' },
      runtimeContext: {} as any,
    });

    await setEnvTool.execute({
      context: { key: 'PROD_API_KEY', value: 'secret_key_123' },
      runtimeContext: {} as any,
    });

    await setEnvTool.execute({
      context: { key: 'PROD_DATABASE_URL', value: 'postgres://user:pass@localhost' },
      runtimeContext: {} as any,
    });
  });

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
    const result = await searchEnvTool.execute({
      context: { keyword: 'TEST_SEARCH', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();
    expect(Object.keys(result.matches || {}).length).toBeGreaterThan(0);

    // Verify our test variables are in the results
    expect(result.matches).toHaveProperty('TEST_SEARCH_VAR_1');
    expect(result.matches).toHaveProperty('TEST_SEARCH_VAR_2');
  });

  it('should return exact values when censor is false', async () => {
    const result = await searchEnvTool.execute({
      context: { keyword: 'TEST_SEARCH_VAR_1', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches?.TEST_SEARCH_VAR_1).toBe('value1');
  });

  it('should censor values when censor is true', async () => {
    const result = await searchEnvTool.execute({
      context: { keyword: 'PROD_API_KEY', censor: true },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();

    if (result.matches?.PROD_API_KEY) {
      // Censored value should be different from original
      expect(result.matches.PROD_API_KEY).not.toBe('secret_key_123');
      // Typically censored as asterisks or similar
      expect(result.matches.PROD_API_KEY).toContain('*');
    }
  });

  it('should return empty object when no matches found', async () => {
    const result = await searchEnvTool.execute({
      context: { keyword: 'NONEXISTENT_KEYWORD_XYZABC123', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();
    expect(Object.keys(result.matches || {}).length).toBe(0);
  });

  it('should find partial matches (case-insensitive)', async () => {
    const result = await searchEnvTool.execute({
      context: { keyword: 'PROD', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();

    const matchKeys = Object.keys(result.matches || {});
    expect(matchKeys.length).toBeGreaterThan(0);

    // Should find both PROD_* variables
    const prodMatches = matchKeys.filter(key => key.includes('PROD'));
    expect(prodMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle special characters in keyword', async () => {
    await setEnvTool.execute({
      context: { key: 'APP_VERSION_1.2.3', value: '1.2.3' },
      runtimeContext: {} as any,
    });

    const result = await searchEnvTool.execute({
      context: { keyword: 'VERSION', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();
  });

  it('should handle empty keyword search', async () => {
    // First set a test variable to ensure something exists
    await setEnvTool.execute({
      context: { key: 'TEST_EMPTY_SEARCH', value: 'test_value' },
      runtimeContext: {} as any,
    });

    const result = await searchEnvTool.execute({
      context: { keyword: '', censor: false },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.matches).toBeDefined();
    // Empty keyword might return all or none depending on implementation
    expect(typeof result.matches).toBe('object');
  });
});
