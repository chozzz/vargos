// apps/mastra/src/mastra/tools/curate-function.tool.test.ts
import { describe, it, expect } from 'vitest';
import { curateFunctionTool } from './curate-function.tool';

describe('curateFunctionTool', () => {
  it('should have correct schema', () => {
    expect(curateFunctionTool.id).toBe('curate-function');

    const inputResult = curateFunctionTool.inputSchema.safeParse({
      userRequest: 'Create weather function',
    });

    expect(inputResult.success).toBe(true);
  });
});
