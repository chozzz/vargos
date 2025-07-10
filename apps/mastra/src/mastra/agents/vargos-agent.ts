import { Agent } from '@mastra/core/agent';
import { pgMemory } from '../memory/pg-memory';
import { vargosMcpClient } from '../mcp/vargos-mcp-client';

export const vargosAgent = new Agent({
  name: 'Vargos Agent',
  description: 'A Vargos assistant powered by Vargos MCP that invokes functions from the Vargos MCP.',
  instructions: `
      You are a Vargos assistant powered by Vargos MCP that invokes functions from the Vargos MCP.

      Use the available MCP tools to help users research topics, gather information, and analyze content.

      Keep responses concise but informative.
      Always cite sources when providing information from browsed URLs or search results.
`,
  model: 'openai/gpt-4o-mini',
  tools: await vargosMcpClient.getTools(),
  memory: pgMemory,
});
