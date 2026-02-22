/**
 * Agent status tool - Show active agent runs via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const AgentStatusParameters = z.object({});

export const agentStatusTool: Tool = {
  name: 'agent_status',
  description: 'Show currently active agent runs with their session keys and duration.',
  parameters: AgentStatusParameters,
  execute: async (_args: unknown, context: ToolContext) => {
    if (!context.call) return errorResult('Gateway not available');

    try {
      const result = await context.call<{ activeRuns: Array<{ runId: string; sessionKey: string; duration: number }> }>(
        'agent', 'agent.status'
      );
      const runs = result.activeRuns;

      if (runs.length === 0) {
        return textResult('No active agent runs.');
      }

      const lines = [
        `Active Runs (${runs.length}):`,
        '',
        ...runs.map(r =>
          `- Run: ${r.runId}\n` +
          `  Session: ${r.sessionKey}\n` +
          `  Duration: ${Math.round(r.duration / 1000)}s`
        ),
      ];

      return textResult(lines.join('\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to get agent status: ${message}`);
    }
  },
};
