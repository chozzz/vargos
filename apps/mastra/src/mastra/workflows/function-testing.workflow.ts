import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { TestAnalysisSchema } from '../agents/sandbox-agent';

/**
 * Function Testing Workflow
 *
 * A simple workflow for testing existing functions.
 *
 * Flow:
 * 1. Run tests via Sandbox Agent
 * 2. Analyze results
 * 3. Return formatted output
 */

// Step 1: Run tests
const runTestsStep = createStep({
  id: 'run-tests',
  description: 'Execute function tests using Sandbox Agent',

  inputSchema: z.object({
    functionId: z.string().describe('ID of function to test'),
    timeout: z.number().optional().default(30000).describe('Test timeout in milliseconds'),
  }),

  outputSchema: TestAnalysisSchema,

  execute: async ({ inputData, mastra }) => {
    const { functionId } = inputData;

    const sandboxAgent = mastra?.getAgent('sandboxAgent');
    if (!sandboxAgent) {
      throw new Error('Sandbox Agent not found');
    }

    const result = await sandboxAgent.generate(
      `Test function with ID: ${functionId}`,
      {
        structuredOutput: {
          schema: TestAnalysisSchema
        }
      }
    );

    return result.object as any;
  },
});

// Step 2: Format test results
const formatTestResultsStep = createStep({
  id: 'format-test-results',
  description: 'Format test analysis into user-friendly message',

  inputSchema: TestAnalysisSchema,

  outputSchema: z.object({
    message: z.string(),
    passed: z.boolean(),
    summary: z.string(),
    issues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      suggestion: z.string(),
    })),
  }),

  execute: async ({ inputData }) => {
    const analysis = inputData;

    let message = '';
    let summary = '';

    if (analysis.passed) {
      summary = `✅ All tests passed (${analysis.testResults.passed}/${analysis.testResults.total})`;
      message = `${summary}\n\nFunction is working correctly!`;
    } else {
      summary = `❌ Tests failed (${analysis.testResults.passed}/${analysis.testResults.total} passed)`;
      message = `${summary}\n\n`;

      if (analysis.issues.length > 0) {
        message += `**Issues Found:**\n\n`;
        analysis.issues.forEach((issue, idx) => {
          message += `${idx + 1}. **${issue.type.replace(/_/g, ' ').toUpperCase()}**\n`;
          message += `   Problem: ${issue.description}\n`;
          if (issue.location) {
            message += `   Location: ${issue.location}\n`;
          }
          message += `   Fix: ${issue.suggestion}\n\n`;
        });
      }

      if (analysis.suggestedFixes.length > 0) {
        message += `\n**Recommended Actions:**\n`;
        analysis.suggestedFixes.forEach((fix, idx) => {
          message += `${idx + 1}. ${fix}\n`;
        });
      }

      message += `\n${analysis.reasoning}`;
    }

    return {
      message,
      passed: analysis.passed,
      summary,
      issues: analysis.issues,
    };
  },
});

// Create the workflow
export const functionTestingWorkflow = createWorkflow({
  id: 'function-testing',
  description: 'Test a function and provide diagnostic feedback',

  inputSchema: z.object({
    functionId: z.string().describe('ID of function to test'),
    timeout: z.number().optional().default(30000),
  }),

  outputSchema: z.object({
    message: z.string().describe('User-friendly test results message'),
    passed: z.boolean().describe('Whether all tests passed'),
    summary: z.string().describe('Brief summary of test results'),
    issues: z.array(z.object({
      type: z.string(),
      description: z.string(),
      suggestion: z.string(),
    })).describe('List of issues found'),
  }),
})
  .then(runTestsStep)
  .then(formatTestResultsStep)
  .commit();
