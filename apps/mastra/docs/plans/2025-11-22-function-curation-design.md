# Function Curation System Design

**Date:** 2025-11-22
**Status:** Approved (Revised)

## Overview

Replace template-based function generation with AI-driven curation that writes complete, production-ready function implementations. The curator is a **fallback capability** - Vargos Agent tries to use existing functions first via RAG, only creating/editing when needed.

## Current State

- `createFunctionWorkflow` generates function scaffolds via LocalDirectoryProvider
- Creates `.meta.json` + `index.ts` stub with TODO comments
- Requires manual implementation afterward
- Limited to predefined templates

## Proposed Solution

### High-Level Architecture

**Vargos Agent as Primary, Curator as Fallback**

```
User Request
    ↓
Vargos Agent (with RAG context of available functions)
    ↓
Can achieve goal with existing functions?
├─ Yes → Execute function(s), return result
│         (No curator needed, no reindex)
│
└─ No → "I don't have a function for that. Should I create/edit one?"
        ↓
    User confirms
        ↓
    curate-function.tool → curateFunctionWorkflow
        ↓
    Function Curator Agent (creates/edits)
        ↓
    Reindex (only if function created/edited)
        ↓
    Next time: RAG finds it automatically
```

### Key Components

1. **Vargos Agent (Primary)**
   - Has RAG context of available functions
   - Tries to use existing functions first
   - Only calls curator when necessary
   - Asks user confirmation before creating/editing

2. **Function Curator Agent (Fallback)**
   - Specialized Mastra agent for function curation
   - Connected to same LLM as Mastra (GPT-4o-mini)
   - Full toolkit: shell, file I/O, functions service, env vars
   - Fully autonomous - drives its own workflow

3. **curateFunctionWorkflow**
   - Simple 2-step workflow:
     - Step 1: Invoke curator with user request
     - Step 2: Reindex if function created/edited
   - No hardcoded context gathering
   - Curator uses its tools naturally

## Use-Cases

### Use-Case 1: Execute Existing Function

**User:** "Get Bitcoin price"

**Flow:**
1. Vargos Agent receives request
2. RAG finds `crypto-get-bitcoin-price` function
3. Vargos Agent executes the function
4. Returns result to user
5. **No curator invoked, no reindex**

**Why:** Existing functions handle the request - no curation needed.

---

### Use-Case 2: Create New Function

**User:** "Get Ethereum gas price from Etherscan"

**Flow:**
1. Vargos Agent receives request
2. RAG searches - no matching function found
3. Vargos Agent: "I don't have a function for that. Should I create one?"
4. User: "Yes"
5. Vargos Agent calls `curate-function` tool
6. curateFunctionWorkflow invokes curator agent
7. Curator:
   - Searches for similar crypto/API functions
   - Determines function name: `crypto-get-ethereum-gas`
   - Checks ETHERSCAN_API_KEY requirement
   - Reads example functions and docs
   - Writes complete implementation
   - Runs type-check/lint
   - Reports: `{ success: true, functionName: 'crypto-get-ethereum-gas', action: 'created' }`
8. Workflow **reindexes** the new function
9. Function ready to use
10. **Next time:** RAG will find this function automatically

**Why:** New functionality needed - curator creates it.

---

### Use-Case 3: Edit Existing Function

**User:** "Add attachment support to jira-create-issue"

**Flow:**
1. Vargos Agent receives request
2. RAG finds `jira-create-issue` function
3. Vargos Agent sees it doesn't support attachments
4. Vargos Agent: "I can enhance jira-create-issue to support attachments. Proceed?"
5. User: "Yes"
6. Vargos Agent calls `curate-function` tool
7. Curator:
   - Searches for "jira" and "attachments"
   - Reads current `jira-create-issue` implementation
   - Reads Jira functions with attachment examples
   - Edits the function to add attachment handling
   - Preserves existing functionality
   - Verifies with type-check/lint
   - Reports: `{ success: true, functionName: 'jira-create-issue', action: 'edited' }`
8. Workflow **reindexes** (function changed)
9. Updated function ready

**Why:** Enhancement needed - curator edits existing function.

---

### Use-Case 4: Fix Broken Function

**User:** "The weather-get-forecast function is failing with API errors"

**Flow:**
1. Vargos Agent: "I'll fix it for you"
2. Vargos Agent calls `curate-function` tool
3. Curator:
   - Searches for `weather-get-forecast`
   - Reads current implementation
   - Executes it to see the error (maybe wrong endpoint?)
   - Fixes the issue
   - Verifies with type-check/lint
   - Reports: `{ success: true, functionName: 'weather-get-forecast', action: 'fixed' }`
4. Workflow **reindexes** (function changed)
5. Fixed function ready

**Why:** Broken function needs repair - curator fixes it.

---

### Use-Case 5: Optimize Function

**User:** "Make text-summarize faster"

**Flow:**
1. Vargos Agent: "I'll optimize it"
2. Vargos Agent calls `curate-function` tool
3. Curator:
   - Reads `text-summarize` implementation
   - Searches for optimization patterns
   - Refactors (streaming, batching, caching)
   - Preserves functionality
   - Verifies
   - Reports: `{ success: true, functionName: 'text-summarize', action: 'optimized' }`
4. Workflow **reindexes** (function changed)
5. Optimized function ready

**Why:** Optimization requested - curator improves performance.

## Component Details

### Function Curator Agent

**Location:** `src/mastra/agents/function-curator-agent.ts`

**Configuration:**
```typescript
new Agent({
  name: 'Function Curator',
  model: 'openai/gpt-4o-mini',
  instructions: `
You're a function curator for Vargos. When given a request to create, edit, fix, or optimize a function:

1. **Determine the task:**
   - Creating new function? Determine appropriate function name (kebab-case)
   - Editing existing? Search for it and read current implementation
   - Fixing broken? Identify the issue and fix it
   - Optimizing? Read current code and improve performance

2. **Gather context using your tools:**
   - Use search-functions to find similar functions as examples
   - Use read-file to read example functions, documentation, package.json
   - Use get-env/check-env to validate required API keys

3. **Write complete TypeScript implementations with:**
   - Proper error handling
   - Type safety (Zod schemas where applicable)
   - JSDoc comments explaining purpose and parameters
   - Follows existing code patterns and style
   - Uses core-lib services when appropriate
   - Validates environment variables before API calls

4. **Verify your work:**
   - Use execute-shell to check what validation scripts exist (package.json)
   - Run type-check and lint scripts if available
   - Fix any errors found (one retry allowed)
   - Report success or failure with details

When editing existing functions, preserve working code and only modify what's needed.
  `,
  tools: {
    // Core-lib integration
    [searchFunctionsTool.id]: searchFunctionsTool,
    [getFunctionMetadataTool.id]: getFunctionMetadataTool,
    [executeFunctionTool.id]: executeFunctionTool,

    // File operations
    [readFileTool.id]: readFileTool,
    [writeFileTool.id]: writeFileTool,
    [listDirectoryTool.id]: listDirectoryTool,

    // Shell access (from core-lib ShellModule)
    [executeShellTool.id]: executeShellTool,

    // Environment
    [getEnvTool.id]: getEnvTool,
    [checkEnvTool.id]: checkEnvTool,
  }
})
```

**Why These Tools:**
- **Search/metadata** - Find similar functions as examples
- **File I/O** - Read examples and docs, write implementations
- **Shell** - Run type-check, lint, discover validation scripts
- **Execute** - Test functions with sample params to verify they work
- **Env** - Validate API keys before using them in code

**Key Design:** Curator is fully autonomous - it uses tools to gather context, write code, and verify, all driven by the user's request.

### curateFunctionWorkflow

**Location:** `src/mastra/workflows/curate-function-workflow.ts`

**Simplified 2-Step Workflow:**

#### Step 1: Invoke Curator (Fully Autonomous)

```typescript
const invokeCurator = createStep({
  id: 'invoke-curator',
  description: 'Curator handles entire curation process autonomously',
  inputSchema: z.object({
    userRequest: z.string().describe('What the user wants to accomplish'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    functionName: z.string(),
    action: z.enum(['created', 'edited', 'fixed', 'optimized']),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { userRequest } = inputData;

    const curatorAgent = mastra.getAgent('function-curator');

    // Just pass the raw request - curator drives everything
    const result = await curatorAgent.generate(userRequest);

    return {
      success: result.success,
      functionName: result.functionName,
      action: result.action,
      message: result.message,
      ...inputData,
    };
  }
});
```

**Why:**
- No hardcoded context gathering
- No prescribed steps
- Curator uses its tools naturally to accomplish the goal
- Fully agent-driven approach

#### Step 2: Reindex Function (Only if Changed)

```typescript
const indexFunction = createStep({
  id: 'index-function',
  description: 'Reindex function for RAG if created/edited',
  inputSchema: z.object({
    success: z.boolean(),
    functionName: z.string(),
    action: z.enum(['created', 'edited', 'fixed', 'optimized']),
    message: z.string(),
    userRequest: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { success, functionName, action, message } = inputData;

    if (!success) {
      return {
        success: false,
        message: `Function curation failed: ${message}`,
      };
    }

    // Reindex only if function was created or edited (file changed on disk)
    const functionsService = await getFunctionsService();
    await functionsService.reindexFunction(functionName);

    return {
      success: true,
      message: `Function "${functionName}" ${action} and indexed successfully`,
    };
  }
});
```

**Why:**
- Only indexes when function actually changes on disk
- Makes function immediately available for RAG
- Completes the self-curative loop

#### Workflow Composition

```typescript
export const curateFunctionWorkflow = createWorkflow({
  id: 'curate-function',
  inputSchema: z.object({
    userRequest: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(invokeCurator)
  .then(indexFunction);

curateFunctionWorkflow.commit();
```

## Integration Points

### Vargos Agent Integration

**Update Vargos Agent's role:**

```typescript
// Updated instructions for Vargos Agent
instructions: `
You are a self-curative Vargos assistant that helps users by utilizing existing functions or creating new ones when needed.

## Your Workflow

1. **Try existing functions first:**
   - You have RAG context of available functions
   - Search for relevant functions using your tools
   - If you find matching functions, use them to fulfill the request
   - Execute functions and return results

2. **Only create/edit when necessary:**
   - If no existing function can fulfill the request, offer to create one
   - If existing function needs enhancement, offer to edit it
   - **Always ask user confirmation before creating/editing**
   - Use the curate-function tool after getting confirmation

3. **Be transparent:**
   - Explain what functions you're using
   - Show what you're creating/editing
   - Provide clear actionable results
`
```

**Replace create-function.tool.ts:**

```typescript
// src/mastra/tools/curate-function.tool.ts
export const curateFunctionTool = createTool({
  id: 'curate-function',
  description: 'Create, edit, fix, or optimize a function with AI assistance. Only use after user confirmation.',
  inputSchema: z.object({
    userRequest: z.string().describe('What the user wants to accomplish'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    return await curateFunctionWorkflow.execute({
      inputData: context,
    });
  },
});
```

**Update Vargos Agent tools:**

```typescript
tools: {
  // Function management (for discovery and execution)
  [listFunctionsTool.id]: listFunctionsTool,
  [searchFunctionsTool.id]: searchFunctionsTool,
  [executeFunctionTool.id]: executeFunctionTool,
  [getFunctionMetadataTool.id]: getFunctionMetadataTool,

  // Curation (fallback when no existing function works)
  [curateFunctionTool.id]: curateFunctionTool, // NEW

  // Other orchestration tools
  [invokeAgentTool.id]: invokeAgentTool,
  [executeWorkflowTool.id]: executeWorkflowTool,
  [runInBackgroundTool.id]: runInBackgroundTool,
}
```

### Tools to Create

New tools needed for curator agent:

1. **File Operations:**
   - `read-file.tool.ts` - Read file contents
   - `write-file.tool.ts` - Write/create files
   - `list-directory.tool.ts` - List directory contents

2. **Shell Access:**
   - `execute-shell.tool.ts` - Execute shell commands (wrap core-lib ShellModule)

3. **Environment:**
   - `get-env.tool.ts` - Get environment variable value
   - `check-env.tool.ts` - Check if env var exists

### Core-lib Dependencies

**Already exist:**
- **FunctionsService** - Search, metadata, execute, reindex
- **ShellModule** - Shell command execution (in apps/core)
- **EnvService** - Environment variable access

## Migration Path

### Phase 1: Build Curator Tools
- Create file operation tools (read, write, list)
- Create shell execution tool
- Create env tools (get, check)
- Test tools independently

### Phase 2: Create Curator Agent
- Implement `function-curator-agent.ts`
- Add comprehensive instructions
- Wire up all tools
- Test curator with sample requests

### Phase 3: Build Workflow
- Implement `curateFunctionWorkflow` (2 steps)
- Test with function creation
- Test with function editing
- Test verification and retry logic

### Phase 4: Integrate with Vargos Agent
- Create `curate-function.tool.ts`
- Update Vargos Agent instructions (RAG-first, curator-fallback)
- Add curateFunctionTool to Vargos Agent
- Test end-to-end flow

### Phase 5: Deprecate Old System
- Remove `createFunctionTool`
- Remove `createFunctionWorkflow`
- Update documentation
- Remove template generation from LocalDirectoryProvider (optional)

## Trade-offs

### Benefits
- ✅ Complete implementations (not scaffolds)
- ✅ Learns from existing functions (consistent patterns)
- ✅ Self-verifying (type-check/lint)
- ✅ Seamless create/edit/fix/optimize (no mode switching)
- ✅ RAG-first approach (efficient - only creates when needed)
- ✅ User confirmation (safe - no surprise changes)
- ✅ True self-curative capability

### Costs
- ⚠️ Higher LLM costs when creating functions (not when using existing ones)
- ⚠️ Slower than template generation
- ⚠️ Requires validation (type-check/lint mandatory)
- ⚠️ Need to monitor quality of generated code

### Mitigations
- RAG-first approach minimizes unnecessary curation
- GPT-4o-mini for cost efficiency
- One retry limit prevents endless loops
- Mandatory validation before indexing
- User confirmation before any changes

## Success Metrics

- **Primary path:** >80% of requests fulfilled by existing functions (no curator needed)
- **Curator quality:** Function passes type-check/lint on first try >70%
- **Curator reliability:** Function passes on retry >90%
- **User experience:** Clear explanations, transparent actions
- **Performance:** Curation time <2 min, execution time <5 sec

## Future Enhancements

1. **RAG Implementation** - Semantic search context for Vargos Agent
2. **Test Generation** - Curator writes unit tests automatically
3. **Performance Optimization** - Curator identifies and optimizes slow functions
4. **Multi-function Coordination** - Curator creates related functions together
5. **Version Control** - Git commits with meaningful messages
6. **Quality Monitoring** - Track curator success rate, common failures
7. **Learning Loop** - Improve curator instructions based on common issues
