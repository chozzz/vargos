import { describe, it, expect, beforeAll } from 'vitest';
import { listFunctionsTool } from './list-functions.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('listFunctionsTool - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize core services before running tests
    await initializeCoreServices();
  });

  it('should validate input schema (empty object)', () => {
    const result = listFunctionsTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate output schema structure', () => {
    const validOutput = {
      success: true,
      functions: [
        {
          id: 'test-function',
          name: 'Test Function',
          description: 'A test function',
          category: 'testing',
          tags: ['test'],
        },
      ],
      total: 1,
    };

    const result = listFunctionsTool.outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it('should list all available functions', async () => {
    const result = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);
    expect(result.functions).toBeDefined();
    expect(Array.isArray(result.functions)).toBe(true);
    expect(result.total).toBeDefined();
    expect(typeof result.total).toBe('number');
    expect(result.total).toBe(result.functions.length);
  });

  it('should return functions with required properties', async () => {
    const result = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    if (result.functions.length > 0) {
      const func = result.functions[0];

      expect(func).toHaveProperty('id');
      expect(func).toHaveProperty('name');
      expect(func).toHaveProperty('description');
      expect(func).toHaveProperty('category');
      expect(func).toHaveProperty('tags');

      expect(typeof func.id).toBe('string');
      expect(typeof func.name).toBe('string');
      expect(typeof func.description).toBe('string');
      expect(Array.isArray(func.tags)).toBe(true);
    }
  });

  it('should return consistent results on multiple calls', async () => {
    const result1 = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    const result2 = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result1.total).toBe(result2.total);
    expect(result1.functions.length).toBe(result2.functions.length);
  });

  it('should have unique function IDs', async () => {
    const result = await listFunctionsTool.execute({
      context: {},
      runtimeContext: {} as any,
    });

    expect(result.success).toBe(true);

    if (result.functions.length > 0) {
      const ids = result.functions.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });
});
