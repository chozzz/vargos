import { describe, it, expect, beforeAll } from 'vitest';
import { getFunctionMetadataTool } from './get-function-metadata.tool';
import { listFunctionsTool } from './list-functions.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('getFunctionMetadataTool - Integration Tests', () => {
  let availableFunctionId: string | null = null;

  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();

    // Get a real function ID to use in tests
    const listResult = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    if (listResult.success && listResult.functions.length > 0) {
      availableFunctionId = listResult.functions[0].id;
    }
  });

  it('should validate input schema', () => {
    const validInput = { functionId: 'test-function' };
    const result = getFunctionMetadataTool.inputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it('should reject invalid input (missing functionId)', () => {
    const invalidInput = {};
    const result = getFunctionMetadataTool.inputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
      metadata: {
        id: 'test-function',
        name: 'Test Function',
        description: 'A test function',
        category: 'testing',
        tags: ['test'],
        requiredEnvVars: [],
        input: [],
        output: [],
      },
    };

    const result = getFunctionMetadataTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should get metadata for existing function', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const result = await getFunctionMetadataTool.execute({
      context: { functionId: availableFunctionId },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should return metadata with required properties', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const result = await getFunctionMetadataTool.execute({
      context: { functionId: availableFunctionId },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();

    if (result.metadata) {
      expect(result.metadata).toHaveProperty('id');
      expect(result.metadata).toHaveProperty('name');
      expect(result.metadata).toHaveProperty('description');
      expect(result.metadata).toHaveProperty('category');
      expect(result.metadata).toHaveProperty('tags');
      expect(result.metadata).toHaveProperty('requiredEnvVars');
      expect(result.metadata).toHaveProperty('input');
      expect(result.metadata).toHaveProperty('output');

      expect(typeof result.metadata.id).toBe('string');
      expect(typeof result.metadata.name).toBe('string');
      expect(typeof result.metadata.description).toBe('string');
      expect(Array.isArray(result.metadata.tags)).toBe(true);
      expect(Array.isArray(result.metadata.requiredEnvVars)).toBe(true);
      expect(Array.isArray(result.metadata.input)).toBe(true);
      expect(Array.isArray(result.metadata.output)).toBe(true);
    }
  });

  it('should handle non-existent function ID gracefully', async () => {
    const result = await getFunctionMetadataTool.execute({
      context: { functionId: 'non-existent-function-xyz-123' },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.metadata).toBeUndefined();
  });

  it('should return consistent metadata on multiple calls', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const result1 = await getFunctionMetadataTool.execute({
      context: { functionId: availableFunctionId },
      runtimeContext: {} as any,
    });

    const result2 = await getFunctionMetadataTool.execute({
      context: { functionId: availableFunctionId },
      runtimeContext: {} as any,
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.metadata).toEqual(result2.metadata);
  });

  it('should have matching ID in metadata', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const result = await getFunctionMetadataTool.execute({
      context: { functionId: availableFunctionId },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.metadata?.id).toBe(availableFunctionId);
  });
});
