import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

/**
 * Function Search Workflow
 *
 * A deterministic workflow for finding and analyzing existing functions.
 * Uses Curator Agent to search and recommend functions.
 *
 * Flow:
 * 1. Semantic search via curator
 * 2. Analyze results
 * 3. Format recommendations for user
 */

// Step 1: Search for functions using Curator Agent
const searchFunctionsStep = createStep({
  id: 'search-functions',
  description: 'Search function repository using Curator Agent',

  inputSchema: z.object({
    query: z.string().describe('Search query describing desired functionality'),
    limit: z.number().optional().default(5).describe('Maximum results to return'),
  }),

  outputSchema: z.object({
    query: z.string(),
    foundFunctions: z.boolean(),
    recommendations: z.array(z.object({
      functionId: z.string(),
      name: z.string(),
      description: z.string(),
      matchScore: z.number(),
    })),
    decision: z.enum(['use_existing', 'extend_existing', 'create_new', 'needs_clarification']),
    reasoning: z.string(),
  }),

  execute: async ({ inputData, mastra }) => {
    const { query } = inputData;

    // Get curator agent from mastra instance
    const curatorAgent = mastra?.getAgent('curatorAgent');

    if (!curatorAgent) {
      throw new Error('Curator Agent not found');
    }

    // Curator analyzes and returns structured output
    const result = await curatorAgent.generate(
      `Search for functions matching: "${query}"`,
      {
        // Pass any memory context if needed
      },
    );

    // Parse curator's structured output
    const curatorOutput = JSON.parse(result.text);

    return {
      query: curatorOutput.query,
      foundFunctions: curatorOutput.foundFunctions,
      recommendations: curatorOutput.recommendations,
      decision: curatorOutput.decision,
      reasoning: curatorOutput.reasoning,
    };
  },
});

// Step 2: Format results for user presentation
const formatResultsStep = createStep({
  id: 'format-results',
  description: 'Format search results into user-friendly message',

  inputSchema: z.object({
    query: z.string(),
    foundFunctions: z.boolean(),
    recommendations: z.array(z.object({
      functionId: z.string(),
      name: z.string(),
      description: z.string(),
      matchScore: z.number(),
    })),
    decision: z.enum(['use_existing', 'extend_existing', 'create_new', 'needs_clarification']),
    reasoning: z.string(),
  }),

  outputSchema: z.object({
    message: z.string(),
    action: z.string(),
    functions: z.array(z.object({
      functionId: z.string(),
      name: z.string(),
      description: z.string(),
      matchScore: z.number(),
    })),
  }),

  execute: async ({ inputData }) => {
    const { query, foundFunctions, recommendations, decision, reasoning } = inputData;

    let message = '';
    let action = '';

    if (!foundFunctions) {
      message = `No existing functions found for: "${query}"\n\n${reasoning}`;
      action = 'create_new';
    } else if (decision === 'use_existing') {
      const top = recommendations[0];
      message = `Found matching function: **${top.name}** (confidence: ${(top.matchScore * 100).toFixed(0)}%)\n\n`;
      message += `Description: ${top.description}\n\n`;
      message += `${reasoning}`;
      action = 'execute';
    } else if (decision === 'extend_existing') {
      message = `Found similar functions, but none are perfect matches:\n\n`;
      recommendations.forEach((fn, idx) => {
        message += `${idx + 1}. **${fn.name}** (${(fn.matchScore * 100).toFixed(0)}% match)\n`;
        message += `   ${fn.description}\n\n`;
      });
      message += `\n${reasoning}`;
      action = 'extend_or_create';
    } else if (decision === 'needs_clarification') {
      message = `I found multiple possibilities for "${query}":\n\n`;
      recommendations.forEach((fn, idx) => {
        message += `${idx + 1}. **${fn.name}**\n   ${fn.description}\n\n`;
      });
      message += `\nWhich one did you mean, or would you like me to create something new?`;
      action = 'clarify';
    }

    return {
      message,
      action,
      functions: recommendations,
    };
  },
});

// Create the workflow
export const functionSearchWorkflow = createWorkflow({
  id: 'function-search',
  description: 'Search for existing functions and provide recommendations',

  inputSchema: z.object({
    query: z.string().describe('Search query for finding functions'),
    limit: z.number().optional().default(5),
  }),

  outputSchema: z.object({
    message: z.string().describe('User-friendly message about search results'),
    action: z.string().describe('Recommended next action'),
    functions: z.array(z.object({
      functionId: z.string(),
      name: z.string(),
      description: z.string(),
      matchScore: z.number(),
    })).describe('List of matching functions'),
  }),
})
  .then(searchFunctionsStep)
  .then(formatResultsStep)
  .commit();
