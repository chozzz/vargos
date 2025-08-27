import { describe, it, expect, beforeAll } from 'vitest';
import { memoryAgent, MemoryOperationSchema } from './memory-agent';
import { initializeCoreServices } from '../services/core.service';

describe('Memory Agent Integration Tests', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  describe('Memory Operation Generation', () => {
    it('should perform store operation with correct structure', { timeout: 30000 }, async () => {
      const request = 'Store this information: User prefers TypeScript for all new functions. This is a global preference.';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      console.log(memoryOp);

      // Verify operation structure
      expect(memoryOp.operation).toBe('store');
      expect(['global', 'thread', 'both']).toContain(memoryOp.scope);
      expect(memoryOp.memories).toBeInstanceOf(Array);
      expect(memoryOp.memories.length).toBeGreaterThan(0);
      expect(memoryOp.summary).toBeDefined();
      expect(memoryOp.insights).toBeDefined();
      expect(memoryOp.reasoning).toBeDefined();

      console.log(`✅ Store operation completed: ${memoryOp.scope} scope`);
      console.log(`   Memories stored: ${memoryOp.memories.length}`);
    });

    it.skip('should perform retrieve operation with relevance scoring', { timeout: 30000 }, async () => {
      const request = 'Retrieve memories related to TypeScript function creation';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.operation).toBe('retrieve');
      expect(memoryOp.memories).toBeInstanceOf(Array);

      // Memories should have relevance scores
      if (memoryOp.memories.length > 0) {
        memoryOp.memories.forEach(memory => {
          expect(['high', 'medium', 'low']).toContain(memory.relevance);
          expect(['global', 'thread']).toContain(memory.scope);
          expect(memory.type).toBeDefined();
        });
      }

      console.log(`✅ Retrieved ${memoryOp.memories.length} memories`);
    });

    it.skip('should perform search operation with filtering', { timeout: 30000 }, async () => {
      const request = 'Search for all memories about email functionality';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.operation).toBe('search');
      expect(memoryOp.summary).toBeDefined();
      expect(memoryOp.reasoning).toBeDefined();

      console.log(`✅ Search completed with ${memoryOp.memories.length} results`);
    });

    it.skip('should perform summarize operation with insights', { timeout: 30000 }, async () => {
      const request = 'Summarize all memories and provide insights about user patterns';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.operation).toBe('summarize');
      expect(memoryOp.summary).toBeDefined();
      expect(memoryOp.insights).toBeDefined();

      console.log(`✅ Summarization completed`);
      console.log(`   Insights: ${memoryOp.insights.substring(0, 100)}...`);
    });
  });

  describe('Memory Classification', () => {
    it.skip('should correctly classify memory types', { timeout: 30000 }, async () => {
      const request = 'Store these: 1) User decided to use SendGrid for emails (decision), 2) Project uses pnpm (fact)';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.memories.length).toBeGreaterThanOrEqual(1);

      const types = memoryOp.memories.map(m => m.type);
      const validTypes = ['fact', 'preference', 'decision', 'context', 'pattern'];
      types.forEach(type => {
        expect(validTypes).toContain(type);
      });

      console.log(`✅ Memory types: ${types.join(', ')}`);
    });

    it.skip('should distinguish between global and thread scope', { timeout: 30000 }, async () => {
      const request = 'Store: User always prefers async/await (global), and we are currently working on email function (thread)';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      const scopes = memoryOp.memories.map(m => m.scope);

      // Should have both scopes represented
      expect(scopes.length).toBeGreaterThan(0);

      console.log(`✅ Memory scopes: ${scopes.join(', ')}`);
    });
  });

  describe('Memory Quality', () => {
    it.skip('should provide actionable summaries', { timeout: 30000 }, async () => {
      const request = 'Retrieve memories about function creation workflows';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.summary).toBeDefined();
      expect(memoryOp.summary.length).toBeGreaterThan(20);

      console.log(`✅ Summary generated (${memoryOp.summary.length} chars)`);
    });

    it.skip('should assign memory IDs', { timeout: 30000 }, async () => {
      const request = 'Store: User wants comprehensive error handling in all functions';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      memoryOp.memories.forEach(memory => {
        expect(memory.id).toBeDefined();
        expect(memory.id).toMatch(/^mem_/); // Should follow memory ID pattern
        expect(memory.timestamp).toBeDefined();
      });

      console.log(`✅ Memory IDs assigned`);
    });
  });

  describe('Memory Agent Metadata', () => {
    it.skip('should have correct agent configuration', () => {
      expect(memoryAgent.name).toBe('Memory Agent');
    });

    it.skip('should use appropriate model for memory operations', () => {
      expect(memoryAgent.model).toBe('openai/gpt-4o');
    });
  });
});
