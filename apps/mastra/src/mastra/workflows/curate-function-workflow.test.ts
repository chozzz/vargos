import { describe, it, expect, vi } from 'vitest';
import { curateFunctionWorkflow } from './curate-function-workflow';

describe('curateFunctionWorkflow', () => {
  it('should have correct input schema', () => {
    expect(curateFunctionWorkflow.inputSchema).toBeDefined();

    const result = curateFunctionWorkflow.inputSchema.safeParse({
      userRequest: 'Create a function to get weather',
    });

    expect(result.success).toBe(true);
  });

  it('should have correct output schema', () => {
    expect(curateFunctionWorkflow.outputSchema).toBeDefined();

    const result = curateFunctionWorkflow.outputSchema.safeParse({
      success: true,
      message: 'Function created',
    });

    expect(result.success).toBe(true);
  });
});
