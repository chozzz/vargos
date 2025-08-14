import { Agent } from '@mastra/core/agent';

// Import tools from organized domains
import {
  searchFunctionsTool,
  getFunctionMetadataTool,
  executeFunctionTool,
} from '../tools/functions';

import { bashTool } from '../tools/shell';

import {
  getEnvTool,
  searchEnvTool,
} from '../tools/env';

async function createFunctionCuratorAgent() {
  return new Agent({
    name: 'Function Curator',
    description: 'Specialized agent for creating, editing, fixing, and optimizing functions',
    instructions: `
You're a function curator for Vargos. When given a request to create, edit, fix, or optimize a function:

1. **Determine the task:**
   - Creating new function? Determine appropriate function name (kebab-case)
   - Editing existing? Search for it and read current implementation
   - Fixing broken? Identify the issue and fix it
   - Optimizing? Read current code and improve performance

2. **Gather context using your tools:**
   - Use search-functions to find similar functions as examples
   - Use bash with 'cat' to read example functions, documentation, package.json
   - Use get-env/search-env to validate required API keys

3. **Write complete TypeScript implementations with:**
   - Proper error handling
   - Type safety (Zod schemas where applicable)
   - JSDoc comments explaining purpose and parameters
   - Follows existing code patterns and style
   - Uses core-lib services when appropriate
   - Validates environment variables before API calls

4. **Verify your work:**
   - Use bash to check what validation scripts exist (package.json)
   - Run type-check and lint scripts if available using bash
   - Fix any errors found (one retry allowed)
   - Report success or failure with details

**File operations:** Always use bash tool with Unix commands (cat, ls, echo, grep, etc.)
- Read file: bash "cat <file>"
- Write file: bash "echo '<content>' > <file>"
- List files: bash "ls -la <dir>"

When editing existing functions, preserve working code and only modify what's needed.

**Output format:**
Return a JSON object with:
{
  "success": boolean,
  "functionName": string,
  "action": "created" | "edited" | "fixed" | "optimized",
  "message": string
}
    `,
    model: 'openai/gpt-4o-mini',
    tools: {
      // Function management tools
      [searchFunctionsTool.id]: searchFunctionsTool,
      [getFunctionMetadataTool.id]: getFunctionMetadataTool,
      [executeFunctionTool.id]: executeFunctionTool,

      // Shell/Bash access (use for file operations: cat, ls, echo, etc.)
      [bashTool.id]: bashTool,

      // Environment
      [getEnvTool.id]: getEnvTool,
      [searchEnvTool.id]: searchEnvTool,
    },
  });
}

export const functionCuratorAgent = await createFunctionCuratorAgent();
