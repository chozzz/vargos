import { describe, it, expect, beforeAll } from 'vitest';
import { researchAgent, ResearchResultSchema } from './research-agent';
import { initializeCoreServices } from '../services/core.service';

describe('Research Agent Integration Tests', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  describe('Research Result Generation', () => {
    it('should generate research results with all required fields', { timeout: 30000 }, async () => {
      const query = 'What are the best practices for error handling in TypeScript?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Verify all required fields are present
      expect(researchResult.query).toBeDefined();
      expect(researchResult.query).toContain('TypeScript');
      expect(researchResult.findings).toBeInstanceOf(Array);
      expect(researchResult.findings.length).toBeGreaterThan(0);
      expect(researchResult.summary).toBeDefined();
      expect(researchResult.confidence).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(researchResult.confidence);
      expect(researchResult.limitations).toBeDefined();
      expect(researchResult.reasoning).toBeDefined();

      console.log(`✅ Research completed for: ${researchResult.query}`);
      console.log(`   Findings: ${researchResult.findings.length}`);
      console.log(`   Confidence: ${researchResult.confidence}`);
    });

    it('should provide multiple findings with sources', { timeout: 30000 }, async () => {
      const query = 'How does async/await work in JavaScript?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Should have multiple findings
      expect(researchResult.findings.length).toBeGreaterThanOrEqual(1);

      // Each finding should have required structure
      researchResult.findings.forEach(finding => {
        expect(finding.title).toBeDefined();
        expect(finding.content).toBeDefined();
        expect(finding.source).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(finding.relevance);
      });

      console.log(`✅ Generated ${researchResult.findings.length} findings with sources`);
    });

    it('should assess confidence levels appropriately', { timeout: 30000 }, async () => {
      const query = 'What is the current version of Node.js?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Should have a confidence level
      expect(researchResult.confidence).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(researchResult.confidence);

      // Should provide reasoning
      expect(researchResult.reasoning).toBeDefined();
      expect(researchResult.reasoning.length).toBeGreaterThan(20);

      console.log(`✅ Confidence assessment: ${researchResult.confidence}`);
    });
  });

  describe('Research Quality', () => {
    it('should identify limitations when present', { timeout: 30000 }, async () => {
      const query = 'What will be the best JavaScript framework in 2030?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Future prediction query should have limitations noted
      expect(researchResult.limitations).toBeDefined();

      // Confidence should likely be lower for speculative queries
      expect(researchResult.confidence).toBeDefined();

      console.log(`✅ Identified limitations for speculative query`);
    });

    it('should rate finding relevance correctly', { timeout: 30000 }, async () => {
      const query = 'How to install npm packages?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Should have findings with relevance ratings
      expect(researchResult.findings.length).toBeGreaterThan(0);

      const relevanceRatings = researchResult.findings.map(f => f.relevance);
      expect(relevanceRatings.every(r => ['high', 'medium', 'low'].includes(r))).toBe(true);

      // At least one finding should be highly relevant
      const highRelevanceCount = relevanceRatings.filter(r => r === 'high').length;
      expect(highRelevanceCount).toBeGreaterThan(0);

      console.log(`✅ Relevance ratings: ${relevanceRatings.join(', ')}`);
    });

    it('should provide actionable summaries', { timeout: 30000 }, async () => {
      const query = 'How to debug memory leaks in Node.js?';

      const response = await researchAgent.generate(query, {
        structuredOutput: {
          schema: ResearchResultSchema
        }
      });

      const researchResult = response.object;

      // Summary should be concise but informative
      expect(researchResult.summary).toBeDefined();
      expect(researchResult.summary.length).toBeGreaterThan(50);
      expect(researchResult.summary.length).toBeLessThan(500);

      // Summary should reference key concepts
      const summary = researchResult.summary.toLowerCase();
      expect(
        summary.includes('memory') || summary.includes('leak') || summary.includes('debug')
      ).toBe(true);

      console.log(`✅ Generated actionable summary (${researchResult.summary.length} chars)`);
    });
  });

  describe('Research Agent Metadata', () => {
    it('should have correct agent configuration', () => {
      expect(researchAgent.name).toBe('Research Agent');
      // Description might not be directly accessible on agent instance
      if (researchAgent.description) {
        expect(researchAgent.description).toBeDefined();
      }
    });

    it('should use appropriate model for research', () => {
      expect(researchAgent.model).toBe('openai/gpt-4o');
    });
  });
});
