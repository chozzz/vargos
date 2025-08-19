import { Agent } from '@mastra/core/agent';
import { pgMemory } from '../memory/pg-memory';

// Import tools from organized domains
import {
  listFunctionsTool,
  searchFunctionsTool,
  executeFunctionTool,
  getFunctionMetadataTool,
} from '../tools/functions';

import {
  executeWorkflowTool,
} from '../tools/orchestration';

import {
  bashTool,
  bashHistoryTool,
  bashInterruptTool,
  runInBackgroundTool,
} from '../tools/shell';

import {
  getEnvTool,
  searchEnvTool,
  setEnvTool,
} from '../tools/env';

import {
  saveToMemoryTool,
  searchMemoryTool,
  deleteFromMemoryTool,
  createMemoryCollectionTool,
} from '../tools/memory';

// Create agent with direct core-lib integration
async function createVargosAgent() {
  return new Agent({
    name: 'Vargos Agent',
    description: 'A self-curative intelligent assistant that discovers and creates functions to fulfill user requests.',
    instructions: `
You help users by finding and using existing Vargos functions, or creating new ones when needed.

## Workflow

1. **Understand the request**
   - What does the user want to accomplish?
   - What parameters might be needed?

2. **Search for existing functions first**
   - Use search-functions to find relevant functions
   - Check function metadata if needed (get-function-metadata)
   - Try to use existing functions before creating new ones

3. **Execute if found**
   - Run the function with appropriate parameters (execute-function)
   - Return results clearly to the user

4. **Create new functions only when necessary**
   - If no existing function works, offer to create one
   - **Always ask user confirmation before creating/editing files**
   - Use bash to inspect similar functions for patterns and conventions
   - Create following project structure and naming conventions
   - Test the function after creation

5. **File operations**
   - Use bash tool for all file operations: cat, ls, echo, grep, mkdir, etc.
   - Inspect code structure: \`bash "ls -la ~/.vargos/functions/src"\`
   - Read examples: \`bash "cat ~/.vargos/functions/src/example.ts"\`
   - Create files: Use echo with heredoc or multiple commands

6. **Environment management**
   - Use get-env, search-env, set-env tools for environment variables
   - Validate required env vars exist before using functions

7. **Memory for context**
   - Use save-to-memory for important information
   - Use search-memory to recall past interactions
   - Create collections for different types of memories

8. **Be transparent**
   - Explain what you're doing at each step
   - Show which functions you're using or creating
   - Provide clear, actionable results
`,
    model: 'openai/gpt-4o', // Switched from Claude to avoid rate limits
    tools: {
      // Function management tools (direct core-lib integration)
      [listFunctionsTool.id]: listFunctionsTool,
      [searchFunctionsTool.id]: searchFunctionsTool,
      [executeFunctionTool.id]: executeFunctionTool,
      [getFunctionMetadataTool.id]: getFunctionMetadataTool,

      // Orchestration tools
      [executeWorkflowTool.id]: executeWorkflowTool,
      [runInBackgroundTool.id]: runInBackgroundTool,

      // Shell/Bash access (use for file operations: cat, ls, echo, etc.)
      [bashTool.id]: bashTool,
      [bashHistoryTool.id]: bashHistoryTool,
      [bashInterruptTool.id]: bashInterruptTool,

      // Environment
      [getEnvTool.id]: getEnvTool,
      [searchEnvTool.id]: searchEnvTool,
      [setEnvTool.id]: setEnvTool,

      // Memory & RAG
      [saveToMemoryTool.id]: saveToMemoryTool,
      [searchMemoryTool.id]: searchMemoryTool,
      [deleteFromMemoryTool.id]: deleteFromMemoryTool,
      [createMemoryCollectionTool.id]: createMemoryCollectionTool,
    },
    memory: pgMemory,
  });
}

// Export a promise that resolves to the agent
export const vargosAgent = await createVargosAgent();
