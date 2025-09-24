# Mastra Tools Refactor: 1:1 Passthrough to Core Services

**Date:** 2025-11-24
**Status:** Approved
**Goal:** Eliminate code duplication by making Mastra tools thin wrappers around `coreServices` methods

## Problem

Current Mastra tools reinvent functionality that already exists in core-lib:
- **Env tools** use `process.env` directly instead of `EnvService`
- **Shell tools** use `child_process.exec` directly instead of `ShellService`
- **Filesystem tools** use `fs/promises` directly (should use shell instead)
- Missing tools for Vector/LLM services needed for RAG/memory

## Solution

**Core Principle:** Mastra tools are thin wrappers that validate input (Zod schemas) and pass through to `coreServices` methods. Zero business logic duplication.

## Tool Organization

### tools/functions/ ✅ (Already correct)
- `list-functions` → `functionsService.listFunctions()`
- `search-functions` → `functionsService.searchFunctions(query, limit)`
- `execute-function` → `functionsService.executeFunction(functionId, params)`
- `get-function-metadata` → `functionsService.getFunctionMetadata(functionId)`

### tools/env/ (Update + add new)

**Update existing:**
- `get-env`
  - Current: Uses `process.env[key]`
  - New: `envService.get(key)`

**Add new:**
- `search-env`
  - Input: `{ keyword, censor? }`
  - Does: `envService.search(keyword, censor)`
  - Returns: Matching env vars (censored if requested)

- `set-env`
  - Input: `{ key, value }`
  - Does: `envService.set(key, value)`
  - Use: Update environment variables

**Remove:**
- ~~`check-env`~~ - Unnecessary, just use `get-env` and check for undefined

### tools/shell/ (Rename + add new)

**Update existing:**
- `bash` (rename from `execute-shell`)
  - Current: Uses `child_process.exec()`
  - New: `shellService.execute(command)`
  - Input: `{ command, cwd? }`
  - Returns: `{ stdout, stderr }`

**Add new:**
- `bash-history`
  - Input: none
  - Does: `shellService.getHistory()`
  - Returns: Array of `{ command, output }` objects
  - Use: Review what commands were executed

- `bash-interrupt`
  - Input: none
  - Does: `shellService.interrupt()`
  - Use: Stop a hanging shell command

**Keep as-is:**
- `run-in-background` - Orchestration layer (not a core service passthrough)

### tools/memory/ (All new - consolidated RAG)

High-level tools that combine VectorService + LLMService for actual use cases:

- `save-to-memory`
  - Input: `{ collection, id, text, metadata? }`
  - Does:
    1. `llmService.generateEmbeddings(text)`
    2. `vectorService.index({ collectionName, id, vector, payload: { text, ...metadata } })`
  - Use: Store important context for later recall

- `search-memory`
  - Input: `{ collection, query, limit?, threshold? }`
  - Does:
    1. `llmService.generateEmbeddings(query)`
    2. `vectorService.search(queryVector, options)`
  - Returns: Relevant memories with scores
  - Use: Recall context from past conversations

- `delete-from-memory`
  - Input: `{ collection, id }`
  - Does: `vectorService.delete(collectionName, id)`
  - Use: Remove outdated/incorrect information

- `create-memory-collection`
  - Input: `{ name }`
  - Does: `vectorService.createCollection(name, vectorSize)`
  - Auto-detects embedding dimension from LLMService
  - Use: Create separate memory namespaces

### tools/orchestration/ (Keep separate)
- `invoke-agent` - Mastra-specific orchestration
- `execute-workflow` - Mastra-specific orchestration

### Remove entirely
- ~~`tools/filesystem/`~~
  - `read-file` → Agents use `bash` with `cat <file>`
  - `write-file` → Agents use `bash` with `echo "..." > <file>`
  - `list-directory` → Agents use `bash` with `ls -la <dir>`
  - **Rationale:** Simpler, more powerful, teaches agents Unix commands

### Defer to workflows/agents
- ~~`curate-function`~~ - Complex multi-step operation, should be workflow/agent
- Keeps using existing tools (search-functions, bash, etc.)

## Implementation Pattern

All tools follow this pattern:

```typescript
import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const exampleTool = createTool({
  id: 'example-tool' as const,
  description: 'Clear description of what this tool does',

  inputSchema: z.object({
    param1: z.string().describe('What this param does'),
    param2: z.number().optional().describe('Optional param'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { param1, param2 } = context;

    try {
      const coreServices = getCoreServices();
      const result = await coreServices.someService.someMethod(param1, param2);

      return {
        success: true,
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        result: null,
        error: errorMessage,
      };
    }
  },
});
```

## Benefits

1. **Zero duplication** - All business logic lives in core-lib
2. **Consistent behavior** - Shell history, env management, etc. work the same everywhere
3. **Easier testing** - Mock coreServices instead of Node.js APIs
4. **Better composability** - Tools can combine multiple services (memory tools)
5. **Simpler maintenance** - Update core-lib, all tools benefit immediately

## Migration Steps

1. Update env tools to use `envService`
2. Rename `execute-shell` to `bash`, update to use `shellService`
3. Add new shell tools (`bash-history`, `bash-interrupt`)
4. Add new env tools (`search-env`, `set-env`)
5. Create new `tools/memory/` domain with 4 consolidated tools
6. Remove `tools/filesystem/` directory
7. Remove `check-env` tool
8. Update agent imports
9. Update agent instructions to use `bash` for file operations
10. Test all tools with integration tests

## Testing Strategy

Each tool should have:
- Unit test with mocked `coreServices`
- Integration test with real coreServices (if feasible)
- Example usage in agent instructions

## Success Criteria

- ✅ All tools use `getCoreServices()` pattern
- ✅ No direct Node.js API usage (`process.env`, `child_process`, `fs/promises`)
- ✅ All tests passing
- ✅ Agents can perform memory/RAG operations
- ✅ Agents can use bash for file operations
