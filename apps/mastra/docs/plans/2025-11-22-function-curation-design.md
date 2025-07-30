# Function Curation System Design

**Date:** 2025-11-22
**Status:** Approved

## Overview

Replace template-based function generation with AI-driven curation that writes complete, production-ready function implementations.

## Current State

- `createFunctionWorkflow` generates function scaffolds via LocalDirectoryProvider
- Creates `.meta.json` + `index.ts` stub with TODO comments
- Requires manual implementation afterward
- Limited to predefined templates

## Proposed Solution

### High-Level Architecture

**Replace Template Generation with AI Curation**

1. **Function Curator Agent** - New specialized Mastra agent
   - Connected to same LLM as Mastra (currently GPT-4o-mini)
   - Equipped with full toolkit: shell access, file I/O, FunctionsService, env vars, search
   - Comprehensive instructions about code patterns, error handling, type safety

2. **curateFunctionWorkflow** - New 4-step workflow
   - Step 1: Gather context (semantic search for similar functions + docs)
   - Step 2: Invoke curator agent with context
   - Step 3: Verify (curator checks type-check + lint) with one retry
   - Step 4: Index the function via FunctionsService

3. **No Create vs Edit Distinction** - Always "curates"
   - If function exists → curator sees existing code and edits
   - If not → creates from scratch

## Component Details

### Function Curator Agent

**Location:** `src/mastra/agents/function-curator-agent.ts`

**Configuration:**
```typescript
new Agent({
  name: 'Function Curator',
  model: 'openai/gpt-4o-mini',
  instructions: `
You're a function curator for Vargos. Study the provided example functions to understand patterns.

Write complete TypeScript implementations with:
- Proper error handling
- Type safety (Zod schemas where applicable)
- JSDoc comments
- Follows existing code style
- Uses core-lib services when needed
- Validates env vars before API calls

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
- **File I/O** - Read examples, write implementations
- **Shell** - Run type-check, lint, git operations
- **Execute** - Test functions with sample params
- **Env** - Validate API keys before using them

### curateFunctionWorkflow

**Location:** `src/mastra/workflows/curate-function-workflow.ts`

#### Step 1: Gather Context

```typescript
const gatherContext = createStep({
  id: 'gather-context',
  description: 'Find similar functions and relevant documentation',
  execute: async ({ inputData }) => {
    const { userRequest, functionName } = inputData;

    // Semantic search for similar functions (top 3)
    const functionsService = await getFunctionsService();
    const similarFunctions = await functionsService.searchFunctions(
      userRequest,
      { limit: 3 }
    );

    // Read their full implementations
    const examples = await Promise.all(
      similarFunctions.map(f => readFunctionCode(f.id))
    );

    // Read relevant docs
    const docs = await readDocs(['development.md', 'architecture.md']);

    // Check if function already exists (for edit mode)
    const existingCode = await readFunctionCode(functionName)
      .catch(() => null);

    return { examples, docs, existingCode, ...inputData };
  }
});
```

**Why:**
- Semantic search finds most relevant examples (not all functions)
- Existing code detection enables seamless create/edit
- Documentation provides context about patterns and standards

#### Step 2: Invoke Curator

```typescript
const invokeCurator = createStep({
  id: 'invoke-curator',
  description: 'Let curator agent write the function implementation',
  execute: async ({ inputData }) => {
    const { userRequest, functionName, examples, docs, existingCode } = inputData;

    const prompt = buildCuratorPrompt({
      request: userRequest,
      functionName,
      examples,
      docs,
      existingCode // null if creating, populated if editing
    });

    const curatorAgent = mastra.getAgent('function-curator');
    const result = await curatorAgent.generate(prompt);

    return { functionPath: result.functionPath, ...inputData };
  }
});
```

**Why:**
- Curator has all context needed to write quality code
- Examples guide style and patterns
- Existing code enables safe editing

#### Step 3: Verify (Curator-Driven)

```typescript
const verifyFunction = createStep({
  id: 'verify-function',
  description: 'Curator verifies its own work',
  execute: async ({ inputData }) => {
    const { functionPath, functionName } = inputData;

    const curatorAgent = mastra.getAgent('function-curator');

    // Let curator verify its own work
    const verifyPrompt = `You just created/edited the function "${functionName}" at ${functionPath}.

Please verify it works correctly:
1. Check what validation scripts are available (package.json)
2. Run type-check and/or lint if available
3. Report the results`;

    const result = await curatorAgent.generate(verifyPrompt);

    if (!result.verified) {
      // One retry - curator already has the errors
      const fixPrompt = `Please fix the issues you found and verify again.`;
      const retryResult = await curatorAgent.generate(fixPrompt);
      return { verified: retryResult.verified, ...inputData };
    }

    return { verified: true, ...inputData };
  }
});
```

**Why:**
- Curator naturally discovers validation scripts (not hardcoded)
- Self-verification with one retry opportunity
- Agent has shell access to run type-check, lint, etc.

#### Step 4: Index Function

```typescript
const indexFunction = createStep({
  id: 'index-function',
  description: 'Index function for semantic search',
  execute: async ({ inputData }) => {
    const { verified, functionName } = inputData;

    if (!verified) {
      return {
        success: false,
        message: 'Function failed validation'
      };
    }

    const functionsService = await getFunctionsService();
    await functionsService.reindexFunction(functionName);

    return {
      success: true,
      message: `Function "${functionName}" curated and indexed successfully`
    };
  }
});
```

**Why:**
- Only index if verification passes
- Makes function immediately available for semantic search
- Completes the self-curative loop

## Integration Points

### Tools Needed

New tools to create for curator agent:

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

- **FunctionsService** - Search, metadata, execute, reindex (already exists)
- **ShellModule** - Shell command execution (already exists in apps/core)
- **EnvService** - Environment variable access (already exists)

### Vargos Agent Integration

Update Vargos Agent to use new workflow:

```typescript
// Replace create-function.tool.ts
export const curateFunctionTool = createTool({
  id: 'curate-function',
  description: 'Create or edit a function with AI assistance',
  inputSchema: z.object({
    userRequest: z.string().describe('What the function should do'),
    functionName: z.string().describe('Function name (kebab-case)'),
  }),
  execute: async ({ context }) => {
    return await curateFunctionWorkflow.execute({
      inputData: context,
    });
  },
});
```

## Migration Path

1. **Phase 1: Build Tools**
   - Create file operation tools
   - Create shell execution tool
   - Create env tools

2. **Phase 2: Create Curator Agent**
   - Implement function-curator-agent.ts
   - Add comprehensive instructions
   - Wire up tools

3. **Phase 3: Build Workflow**
   - Implement curateFunctionWorkflow
   - Test with simple function creation
   - Test with function editing

4. **Phase 4: Replace Old Workflow**
   - Update Vargos Agent to use curateFunctionTool
   - Deprecate createFunctionTool
   - Remove createFunctionWorkflow

## Trade-offs

### Benefits
- ✅ Complete implementations (not just scaffolds)
- ✅ Learns from existing functions (consistent patterns)
- ✅ Self-verifying (runs type-check/lint)
- ✅ Seamless create/edit (no mode switching)
- ✅ True self-curative capability

### Costs
- ⚠️ Higher LLM costs (generating full implementations)
- ⚠️ Slower than template generation
- ⚠️ Requires validation (type-check/lint mandatory)
- ⚠️ Need to monitor quality of generated code

### Mitigations
- Use GPT-4o-mini for cost efficiency
- Cache similar function searches
- One retry limit prevents endless loops
- Mandatory validation before indexing

## Success Metrics

- Function passes type-check/lint on first try: >70%
- Function passes on retry: >90%
- User satisfaction with generated code: High
- Time from request to working function: <2 min

## Future Enhancements

1. **Test Generation** - Curator writes unit tests
2. **Performance Optimization** - Curator optimizes existing functions
3. **Multi-function Coordination** - Curator creates related functions together
4. **Version Control** - Git commits with meaningful messages
