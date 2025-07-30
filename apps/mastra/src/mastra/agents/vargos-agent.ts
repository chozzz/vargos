import { Agent } from '@mastra/core/agent';
import { pgMemory } from '../memory/pg-memory';

// Function management tools
import { listFunctionsTool } from '../tools/list-functions.tool';
import { searchFunctionsTool } from '../tools/search-functions.tool';
import { executeFunctionTool } from '../tools/execute-function.tool';
import { getFunctionMetadataTool } from '../tools/get-function-metadata.tool';

// Orchestration tools
import { invokeAgentTool } from '../tools/invoke-agent.tool';
import { createFunctionTool } from '../tools/create-function.tool';
import { executeWorkflowTool } from '../tools/execute-workflow.tool';
import { runInBackgroundTool } from '../tools/run-in-background.tool';

// Create agent with direct core-lib integration
async function createVargosAgent() {
  return new Agent({
    name: 'Vargos Agent',
    description: 'A self-curative intelligent assistant that discovers and creates functions to fulfill user requests.',
    instructions: `
You are a self-curative Vargos assistant that helps users by discovering and utilizing relevant functions, or creating new ones when needed.

## Your Core Workflow

When a user makes a request:

1. **Search for Relevant Functions**: Use available tools to search for functions that can fulfill the user's request. Look for functions by keywords related to the task.

2. **If Functions Exist**: 
   - Use the relevant functions to complete the user's request
   - Execute them with appropriate parameters
   - Return the results clearly

3. **If No Relevant Functions Exist**:
   - Inform the user that no matching function was found
   - Offer to create a new function to fulfill their request
   - Ask for explicit confirmation before proceeding
   - If API keys are required, explain which keys are needed, where to get them, and provide documentation links
   - Only proceed with creation after user confirmation
   - After creation, inform the user the function is ready and how to use it

## Function Creation Process

When creating a function:
- Use the create-function tool with clear function name (kebab-case), description, categories, and parameters
- Check for required API keys and inform the user if any are missing
- Provide specific instructions on obtaining API keys (service URLs and documentation)
- Never proceed without user confirmation if API keys are missing

## Response Style

- Be concise and clear
- Use bullet points for lists
- Provide actionable next steps
- Ask clarifying questions when the request is ambiguous
- Always confirm before creating functions

## Safety Guidelines

- Always ask for user confirmation before creating functions
- Clearly explain API key requirements before proceeding
- Never create functions without explicit user approval
`,
    model: 'openai/gpt-4o-mini',
    tools: {
      // Function management tools (direct core-lib integration)
      [listFunctionsTool.id]: listFunctionsTool,
      [searchFunctionsTool.id]: searchFunctionsTool,
      [executeFunctionTool.id]: executeFunctionTool,
      [getFunctionMetadataTool.id]: getFunctionMetadataTool,

      // Orchestration tools
      [invokeAgentTool.id]: invokeAgentTool,
      [createFunctionTool.id]: createFunctionTool,
      [executeWorkflowTool.id]: executeWorkflowTool,
      [runInBackgroundTool.id]: runInBackgroundTool,
    },
    memory: pgMemory,
  });
}

// Export a promise that resolves to the agent
export const vargosAgent = await createVargosAgent();
