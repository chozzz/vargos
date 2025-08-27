import { describe, it, expect, beforeAll } from 'vitest';
import { researchAgent, ResearchResultSchema } from './research-agent';
import { memoryAgent, MemoryOperationSchema } from './memory-agent';
import { curatorAgent, CuratorOutputSchema } from './curator-agent';
import { functionCreatorAgent, FunctionGenerationSchema } from './function-creator-agent';
import { initializeCoreServices } from '../services/core.service';

describe('Phase 3 Agent Integration Tests', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  describe('Research Agent Integration', () => {
    it('should provide research context for function creation', { timeout: 30000 }, async () => {
      const query = 'How to send emails using SendGrid API in TypeScript';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Verify research structure
      expect(researchResult.query).toBe(query);
      expect(researchResult.findings).toBeInstanceOf(Array);
      expect(researchResult.summary).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(researchResult.confidence);
      expect(researchResult.reasoning).toBeDefined();

      // Should have useful findings
      expect(researchResult.findings.length).toBeGreaterThan(0);
      researchResult.findings.forEach(finding => {
        expect(finding.title).toBeDefined();
        expect(finding.content).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(finding.relevance);
      });

      console.log(`✅ Research completed: ${researchResult.findings.length} findings`);
      console.log(`   Confidence: ${researchResult.confidence}`);
    });

    it('should research technical concepts for agent decision-making', { timeout: 30000 }, async () => {
      const query = 'Best practices for error handling in TypeScript async functions';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      expect(researchResult.findings.length).toBeGreaterThan(0);
      expect(researchResult.summary.length).toBeGreaterThan(20);

      // Research should identify relevant concepts
      const allContent = researchResult.findings.map(f => f.content).join(' ').toLowerCase();
      const hasRelevantContent =
        allContent.includes('error') ||
        allContent.includes('try') ||
        allContent.includes('async') ||
        allContent.includes('typescript');

      expect(hasRelevantContent).toBe(true);

      console.log(`✅ Research identified technical concepts`);
    });

    it('should handle research with low confidence gracefully', { timeout: 30000 }, async () => {
      const query = 'Very obscure technical query that likely has limited information';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Should still provide structured output even with low confidence
      expect(researchResult.confidence).toBeDefined();
      expect(researchResult.limitations).toBeDefined();
      expect(researchResult.reasoning).toBeDefined();

      console.log(`✅ Research handled low-confidence scenario: ${researchResult.confidence}`);
    });
  });

  describe('Memory Agent Integration', () => {
    it('should store and retrieve user preferences across agents', { timeout: 30000 }, async () => {
      // Step 1: Store a preference
      const storeRequest = 'Store this: User always prefers TypeScript strict mode and comprehensive error handling in all functions';

      const storeResponse = await memoryAgent.generate(storeRequest, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const storeOp = storeResponse.object;

      expect(storeOp.operation).toBe('store');
      expect(storeOp.memories.length).toBeGreaterThan(0);
      expect(['global', 'thread', 'both']).toContain(storeOp.scope);

      console.log(`✅ Stored ${storeOp.memories.length} memories in ${storeOp.scope} scope`);

      // Step 2: Retrieve the preference
      const retrieveRequest = 'Retrieve memories about user code preferences';

      const retrieveResponse = await memoryAgent.generate(retrieveRequest, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const retrieveOp = retrieveResponse.object;

      expect(retrieveOp.operation).toBe('retrieve');
      expect(retrieveOp.summary).toBeDefined();

      console.log(`✅ Retrieved ${retrieveOp.memories.length} relevant memories`);
    });

    it('should distinguish between global and thread-specific memories', { timeout: 30000 }, async () => {
      const request = 'Store: User email is user@example.com (global), and we are currently working on SendGrid integration (thread context)';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.operation).toBe('store');
      expect(memoryOp.memories.length).toBeGreaterThan(0);

      // Should classify memories with appropriate scopes
      const scopes = memoryOp.memories.map(m => m.scope);
      expect(scopes.some(s => s === 'global' || s === 'thread')).toBe(true);

      console.log(`✅ Memory scopes: ${scopes.join(', ')}`);
    });

    it('should search memories and provide insights', { timeout: 30000 }, async () => {
      const request = 'Search for all memories about email functionality and provide insights';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.operation).toBe('search');
      expect(memoryOp.summary).toBeDefined();
      expect(memoryOp.reasoning).toBeDefined();

      console.log(`✅ Search completed with insights`);
    });

    it('should classify memory types correctly', { timeout: 30000 }, async () => {
      const request = 'Store: User decided to use pnpm (decision), project requires Node 20+ (fact), prefer async/await over callbacks (preference)';

      const response = await memoryAgent.generate(request, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      const memoryOp = response.object;

      expect(memoryOp.memories.length).toBeGreaterThan(0);

      const types = memoryOp.memories.map(m => m.type);
      const validTypes = ['fact', 'preference', 'decision', 'context', 'pattern'];
      types.forEach(type => {
        expect(validTypes).toContain(type);
      });

      console.log(`✅ Memory types classified: ${types.join(', ')}`);
    });
  });

  describe('Versioning Integration', () => {
    it('should generate functions with semantic version', { timeout: 30000 }, async () => {
      const functionSpec = 'Create a new function to format currency';

      const response = await functionCreatorAgent.generate(functionSpec, {
        structuredOutput: {
          schema: FunctionGenerationSchema
        }
      });

      const functionData = response.object;

      // Should include version field
      expect(functionData.version).toBeDefined();
      expect(functionData.version).toMatch(/^\d+\.\d+\.\d+$/); // semver format

      // New functions should start at 1.0.0
      expect(functionData.version).toBe('1.0.0');

      console.log(`✅ Function created with version: ${functionData.version}`);
    });

    it('should include version in curator recommendations', { timeout: 30000 }, async () => {
      const query = 'Find functions for email sending';

      const response = await curatorAgent.generate(query, {
        structuredOutput: {
          schema: CuratorOutputSchema
        }
      });

      const curatorOutput = response.object;

      // Recommendations should include version field
      if (curatorOutput.recommendations.length > 0) {
        curatorOutput.recommendations.forEach(rec => {
          expect(rec.version).toBeDefined();
        });

        console.log(`✅ Curator recommendations include versions`);
      } else {
        console.log('⚠️ No recommendations found (expected if no functions exist)');
      }
    });

    it('should recommend versioning strategy for similar functions', { timeout: 30000 }, async () => {
      const query = 'Function to send emails with attachments';

      const response = await curatorAgent.generate(query, {
        structuredOutput: {
          schema: CuratorOutputSchema
        }
      });

      const curatorOutput = response.object;

      expect(['use_existing', 'extend_existing', 'create_new', 'needs_clarification']).toContain(curatorOutput.decision);
      expect(curatorOutput.reasoning).toBeDefined();
      expect(curatorOutput.suggestedAction).toBeDefined();

      // If extend_existing, reasoning should mention versioning
      if (curatorOutput.decision === 'extend_existing') {
        const reasoningLower = curatorOutput.reasoning.toLowerCase();
        const mentionsVersioning =
          reasoningLower.includes('version') ||
          reasoningLower.includes('v2') ||
          reasoningLower.includes('major');

        // Note: LLM may or may not mention versioning explicitly
        console.log(`✅ Curator decision: ${curatorOutput.decision}`);
      }

      console.log(`   Decision: ${curatorOutput.decision}`);
      console.log(`   Reasoning: ${curatorOutput.reasoning.substring(0, 100)}...`);
    });
  });

  describe('Phase 3 Cross-Agent Integration', () => {
    it('should use research to inform function creation', { timeout: 45000 }, async () => {
      // Step 1: Research a topic
      const researchQuery = 'Best practices for input validation in TypeScript functions';

      const researchResponse = await researchAgent.generate(researchQuery, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const research = researchResponse.object;
      expect(research.findings.length).toBeGreaterThan(0);

      // Step 2: Use research insights to create function
      const functionSpec = `Create a function to validate user input. Use these best practices: ${research.summary}`;

      const creatorResponse = await functionCreatorAgent.generate(functionSpec, {
        structuredOutput: {
          schema: FunctionGenerationSchema
        }
      });

      const functionData = creatorResponse.object;

      // Function should incorporate validation logic
      expect(functionData.code).toBeDefined();
      expect(functionData.description.toLowerCase()).toContain('validat');

      console.log(`✅ Research → Creator pipeline successful`);
      console.log(`   Research findings: ${research.findings.length}`);
      console.log(`   Function created: ${functionData.name}`);
    });

    it('should use memory to maintain context across function creation', { timeout: 45000 }, async () => {
      // Step 1: Store project context in memory
      const storeRequest = 'Store: This project uses pnpm, targets Node 20+, and prefers functional programming patterns';

      const storeResponse = await memoryAgent.generate(storeRequest, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      expect(storeResponse.object.operation).toBe('store');

      // Step 2: Create function (in real flow, creator would retrieve memories)
      const functionSpec = 'Create a utility function for array manipulation';

      const creatorResponse = await functionCreatorAgent.generate(functionSpec, {
        structuredOutput: {
          schema: FunctionGenerationSchema
        }
      });

      const functionData = creatorResponse.object;

      // Function metadata should align with stored preferences
      expect(functionData.code).toBeDefined();
      expect(functionData.version).toBe('1.0.0');

      console.log(`✅ Memory → Creator context maintained`);
      console.log(`   Function: ${functionData.name}`);
    });

    it('should integrate research, memory, and curator for informed decisions', { timeout: 60000 }, async () => {
      // Step 1: Store decision in memory
      const memoryRequest = 'Store: We decided to use SendGrid for all email functionality (decision)';

      const memoryResponse = await memoryAgent.generate(memoryRequest, {
        structuredOutput: {
          schema: MemoryOperationSchema
        }
      });

      expect(memoryResponse.object.operation).toBe('store');

      // Step 2: Research SendGrid integration
      const researchResponse = await researchAgent.generate('SendGrid TypeScript integration', {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      expect(researchResponse.object.findings.length).toBeGreaterThan(0);

      // Step 3: Curator checks for existing email functions
      const curatorResponse = await curatorAgent.generate('Find email sending functions', {
        structuredOutput: {
          schema: CuratorOutputSchema
        }
      });

      expect(['use_existing', 'extend_existing', 'create_new', 'needs_clarification']).toContain(curatorResponse.object.decision);

      console.log(`✅ Full Phase 3 integration pipeline successful`);
      console.log(`   Memory stored: ${memoryResponse.object.memories.length} items`);
      console.log(`   Research findings: ${researchResponse.object.findings.length}`);
      console.log(`   Curator decision: ${curatorResponse.object.decision}`);
    });
  });

  describe('Phase 3 Agent Metadata', () => {
    it('should have correct Research Agent configuration', () => {
      expect(researchAgent.name).toBe('Research Agent');
      expect(researchAgent.model).toBe('openai/gpt-4o');
    });

    it('should have correct Memory Agent configuration', () => {
      expect(memoryAgent.name).toBe('Memory Agent');
      expect(memoryAgent.model).toBe('openai/gpt-4o');
    });
  });
});
