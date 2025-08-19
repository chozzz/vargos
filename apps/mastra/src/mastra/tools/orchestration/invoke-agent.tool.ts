import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Tool for invoking other agents
 * Note: Agents are lazily loaded via Mastra registry to avoid circular dependencies
 */
export const invokeAgentTool = createTool({
  id: 'invoke-agent' as const,
  description: 'Invoke another specialized agent to handle a specific task',
  inputSchema: z.object({
    agentName: z.enum([
      'vargos',
    ]).describe('Name of the agent to invoke'),
    query: z.string().describe('Query to send to the agent'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    response: z.string(),
    agent: z.string(),
  }),
  execute: async ({ context, mastra }): Promise<{ success: boolean; response: string; agent: string }> => {
    const { agentName, query } = context;

    try {
      if (!mastra) {
        return {
          success: false,
          response: 'Mastra instance not available',
          agent: agentName,
        };
      }

      // Get agent from Mastra registry to avoid circular dependency
      const agent = mastra.getAgent(agentName);

      if (!agent) {
        return {
          success: false,
          response: `Agent "${agentName}" not found in registry`,
          agent: agentName,
        };
      }

      const response = await agent.generate(query);
      return {
        success: true,
        response: response.text || 'No response',
        agent: agentName,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        response: `Error invoking ${agentName}: ${errorMessage}`,
        agent: agentName,
      };
    }
  },
});
