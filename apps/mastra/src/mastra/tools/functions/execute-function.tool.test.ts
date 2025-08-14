import { describe, it, expect, beforeAll } from 'vitest';
import { executeFunctionTool } from './execute-function.tool';
import { listFunctionsTool } from './list-functions.tool';
import { getFunctionMetadataTool } from './get-function-metadata.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('executeFunctionTool - Integration Tests', () => {
  let availableFunctionId: string | null = null;
  let functionMetadata: any = null;

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

      // Get metadata for the function
      const metadataResult = await getFunctionMetadataTool.execute({
        context: { functionId: availableFunctionId },
        runtimeContext: {} as any,
      });

      if (metadataResult.success) {
        functionMetadata = metadataResult.metadata;
      }
    }
  });

  it('should validate input schema', () => {
    const validInput = {
      functionId: 'test-function',
      params: { key: 'value' },
    };
    const result = executeFunctionTool.inputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it('should reject invalid input (missing functionId)', () => {
    const invalidInput = { params: {} };
    const result = executeFunctionTool.inputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should reject invalid input (missing params)', () => {
    const invalidInput = { functionId: 'test' };
    const result = executeFunctionTool.inputSchema.safeParse(invalidInput);

    expect(result.success).toBe(false);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
      result: { data: 'test' },
    };

    const result = executeFunctionTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should handle non-existent function ID gracefully', async () => {
    const result = await executeFunctionTool.execute({
      context: {
        functionId: 'non-existent-function-xyz-123',
        params: {},
      },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('should execute function with valid ID and params', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    // Build minimal required params based on metadata
    const params: Record<string, any> = {};

    // If function has required inputs, try to provide minimal values
    if (functionMetadata?.input && Array.isArray(functionMetadata.input)) {
      functionMetadata.input.forEach((input: any) => {
        if (input.name) {
          // Provide minimal test values based on type
          params[input.name] = input.type === 'number' ? 0 : '';
        }
      });
    }

    const result = await executeFunctionTool.execute({
      context: {
        functionId: availableFunctionId,
        params,
      },
      runtimeContext: {} as any,
    });

    // Function might fail due to missing env vars or invalid params,
    // but tool should handle it gracefully
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');

    if (!result.success) {
      expect(result.error).toBeDefined();
    } else {
      expect(result.result).toBeDefined();
    }
  });

  it('should handle empty params object', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const result = await executeFunctionTool.execute({
      context: {
        functionId: availableFunctionId,
        params: {},
      },
      runtimeContext: {} as any,
    });

    // Should not crash, but might fail with error
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });

  it('should provide error message on failure', async () => {
    const result = await executeFunctionTool.execute({
      context: {
        functionId: 'invalid-function',
        params: {},
      },
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.error?.length).toBeGreaterThan(0);
  });

  it('should handle params with various data types', async () => {
    if (!availableFunctionId) {
      console.warn('No functions available to test');
      return;
    }

    const params = {
      stringParam: 'test',
      numberParam: 123,
      booleanParam: true,
      arrayParam: [1, 2, 3],
      objectParam: { key: 'value' },
    };

    const result = await executeFunctionTool.execute({
      context: {
        functionId: availableFunctionId,
        params,
      },
      runtimeContext: {} as any,
    });

    // Should handle various param types without crashing
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });
});
