import { Agent } from '@mastra/core/agent';
import { pgMemory } from '../memory/pg-memory';

// Import tools from organized domains
import {
  listFunctionsTool,
  searchFunctionsTool,
  executeFunctionTool,
  getFunctionMetadataTool,
  curateFunctionTool,
} from '../tools/functions';

import {
  invokeAgentTool,
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
You are a self-curative Vargos assistant that helps users by utilizing existing functions or creating new ones when needed.

## Your Workflow

1. **Use your tools to help the user:**
   - Find the most efficient tool to use to help the user.

2. **Try existing functions first:**
   - Search for relevant functions using search-functions
   - If you find matching functions, use them to fulfill the request
   - Execute functions and return results

3. **Only create/edit when necessary:**
   - If no existing function can fulfill the request, offer to create one
   - If existing function needs enhancement, offer to edit it
   - **Always ask user confirmation before creating/editing**
   - Use the curate-function tool after getting confirmation

4. **File operations:**
   - Use the bash tool with Unix commands (cat, ls, echo, grep, etc.)
   - Examples: bash "cat file.txt", bash "ls -la", bash "echo 'content' > file.txt"

5. **Memory/RAG operations:**
   - Use save-to-memory to remember important context for later
   - Use search-memory to recall relevant information from past conversations
   - Create separate collections for different types of memories

6. **Be transparent:**
   - Explain what functions you're using
   - Show what you're creating/editing
   - Provide clear actionable results
`,
    model: 'anthropic/claude-sonnet-4-5-20250929',
    tools: {
      // Function management tools (direct core-lib integration)
      [listFunctionsTool.id]: listFunctionsTool,
      [searchFunctionsTool.id]: searchFunctionsTool,
      [executeFunctionTool.id]: executeFunctionTool,
      [getFunctionMetadataTool.id]: getFunctionMetadataTool,

      // Curation (fallback when no existing function works)
      [curateFunctionTool.id]: curateFunctionTool,

      // Orchestration tools
      [invokeAgentTool.id]: invokeAgentTool,
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
