import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

/**
 * Tool for testing Vargos functions
 *
 * Runs tests for a function in a safe environment and returns results
 */
export const testFunctionTool = createTool({
  id: 'test-function' as const,
  description: 'Run tests for a Vargos function and return test results',
  inputSchema: z.object({
    functionId: z.string().describe('ID of the function to test'),
    timeout: z.number().optional().default(30000).describe('Test timeout in milliseconds'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    passed: z.boolean(),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    testSummary: z.object({
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
      skipped: z.number(),
    }).optional(),
  }),
  execute: async ({ context }): Promise<{
    success: boolean;
    passed: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    testSummary?: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    };
  }> => {
    const { functionId, timeout = 30000 } = context;

    try {
      const coreServices = getCoreServices();
      const functionsDir = process.env.FUNCTIONS_DIR;

      if (!functionsDir) {
        throw new Error('FUNCTIONS_DIR environment variable not set');
      }

      // Get function metadata to find the test file path
      const functionMeta = await coreServices.functionsService.getFunctionMetadata(functionId);

      // Run tests using shell service
      // Assuming tests are run with: pnpm test <function-id>
      const testCommand = `cd ${functionsDir} && pnpm test ${functionId}; echo "EXIT_CODE:$?"`;

      const output = await coreServices.shellService!.execute(testCommand);

      // Parse exit code from output
      const exitCodeMatch = output.match(/EXIT_CODE:(\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 1;

      // Parse test output to extract summary (basic parsing)
      const testSummary = parseTestOutput(output);

      return {
        success: true,
        passed: exitCode === 0,
        stdout: output,
        stderr: '', // Shell service combines stdout and stderr
        exitCode,
        testSummary,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to test function: ${errorMessage}`);
    }
  },
});

/**
 * Parse test output to extract summary
 * Supports common test runner formats (vitest, jest, etc.)
 */
function parseTestOutput(output: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  // Look for common test summary patterns
  // Example: "Tests: 5 passed, 2 failed, 7 total"
  const testPattern = /Tests:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?(?:,\s*(\d+)\s*total)?/i;
  const match = output.match(testPattern);

  if (match) {
    const passed = parseInt(match[1] || '0', 10);
    const failed = parseInt(match[2] || '0', 10);
    const skipped = parseInt(match[3] || '0', 10);
    const total = parseInt(match[4] || String(passed + failed + skipped), 10);

    return { total, passed, failed, skipped };
  }

  // Vitest format: "Test Files  1 passed (1)"
  const vitestPattern = /Test Files\s+(\d+)\s+passed.*Tests\s+(\d+)\s+passed(?:.*(\d+)\s+failed)?/i;
  const vitestMatch = output.match(vitestPattern);

  if (vitestMatch) {
    const passed = parseInt(vitestMatch[2] || '0', 10);
    const failed = parseInt(vitestMatch[3] || '0', 10);
    const total = passed + failed;

    return { total, passed, failed, skipped: 0 };
  }

  return undefined;
}
