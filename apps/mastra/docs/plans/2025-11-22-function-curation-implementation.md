# Function Curation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace template-based function generation with AI-driven curation where a specialized curator agent writes complete, production-ready implementations.

**Architecture:** Vargos Agent tries existing functions first (RAG-first). Only when needed, it calls curate-function tool → curateFunctionWorkflow → Function Curator Agent (autonomous with full toolkit) → reindex on success.

**Tech Stack:** Mastra framework, GPT-4o-mini, TypeScript, Zod, core-lib integration

---

## Phase 1: Build Curator Tools

Tools needed for Function Curator Agent to operate autonomously.

### Task 1: File Read Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/read-file.tool.ts`
- Test: `apps/mastra/src/mastra/tools/read-file.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/read-file.tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileTool } from './read-file.tool';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('readFileTool', () => {
  const testDir = path.join(__dirname, '__test_files__');
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, 'Hello World');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should read file contents', async () => {
    const result = await readFileTool.execute({
      context: { filePath: testFile },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe('Hello World');
  });

  it('should handle missing files gracefully', async () => {
    const result = await readFileTool.execute({
      context: { filePath: '/nonexistent/file.txt' },
      runtimeContext: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test read-file.tool.test.ts`
Expected: FAIL with "Cannot find module './read-file.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/read-file.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';

export const readFileTool = createTool({
  id: 'read-file' as const,
  description: 'Read the contents of a file',

  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the file to read'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    content: z.string().optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { filePath } = context;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test read-file.tool.test.ts`
Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/read-file.tool.ts apps/mastra/src/mastra/tools/read-file.tool.test.ts
git commit -m "feat: add read-file tool for curator agent"
```

---

### Task 2: File Write Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/write-file.tool.ts`
- Test: `apps/mastra/src/mastra/tools/write-file.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/write-file.tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileTool } from './write-file.tool';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('writeFileTool', () => {
  const testDir = path.join(__dirname, '__test_files__');
  const testFile = path.join(testDir, 'output.txt');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should write file contents', async () => {
    const result = await writeFileTool.execute({
      context: {
        filePath: testFile,
        content: 'Test Content',
      },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);

    const written = await fs.readFile(testFile, 'utf-8');
    expect(written).toBe('Test Content');
  });

  it('should create parent directories if needed', async () => {
    const nestedFile = path.join(testDir, 'nested/dir/file.txt');

    const result = await writeFileTool.execute({
      context: {
        filePath: nestedFile,
        content: 'Nested',
      },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);

    const written = await fs.readFile(nestedFile, 'utf-8');
    expect(written).toBe('Nested');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test write-file.tool.test.ts`
Expected: FAIL with "Cannot find module './write-file.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/write-file.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

export const writeFileTool = createTool({
  id: 'write-file' as const,
  description: 'Write content to a file, creating parent directories if needed',

  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { filePath, content } = context;

    try {
      // Create parent directories if they don't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, 'utf-8');

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test write-file.tool.test.ts`
Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/write-file.tool.ts apps/mastra/src/mastra/tools/write-file.tool.test.ts
git commit -m "feat: add write-file tool for curator agent"
```

---

### Task 3: List Directory Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/list-directory.tool.ts`
- Test: `apps/mastra/src/mastra/tools/list-directory.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/list-directory.tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listDirectoryTool } from './list-directory.tool';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('listDirectoryTool', () => {
  const testDir = path.join(__dirname, '__test_files__');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
    await fs.writeFile(path.join(testDir, 'file2.ts'), 'content2');
    await fs.mkdir(path.join(testDir, 'subdir'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list directory contents', async () => {
    const result = await listDirectoryTool.execute({
      context: { dirPath: testDir },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(3);
    expect(result.entries).toContain('file1.txt');
    expect(result.entries).toContain('file2.ts');
    expect(result.entries).toContain('subdir');
  });

  it('should handle missing directories gracefully', async () => {
    const result = await listDirectoryTool.execute({
      context: { dirPath: '/nonexistent/dir' },
      runtimeContext: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test list-directory.tool.test.ts`
Expected: FAIL with "Cannot find module './list-directory.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/list-directory.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';

export const listDirectoryTool = createTool({
  id: 'list-directory' as const,
  description: 'List the contents of a directory',

  inputSchema: z.object({
    dirPath: z.string().describe('Absolute path to the directory to list'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    entries: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { dirPath } = context;

    try {
      const entries = await fs.readdir(dirPath);
      return {
        success: true,
        entries,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test list-directory.tool.test.ts`
Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/list-directory.tool.ts apps/mastra/src/mastra/tools/list-directory.tool.test.ts
git commit -m "feat: add list-directory tool for curator agent"
```

---

### Task 4: Execute Shell Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/execute-shell.tool.ts`
- Test: `apps/mastra/src/mastra/tools/execute-shell.tool.test.ts`
- Reference: `apps/core/src/shell/` (for integration pattern)

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/execute-shell.tool.test.ts
import { describe, it, expect } from 'vitest';
import { executeShellTool } from './execute-shell.tool';

describe('executeShellTool', () => {
  it('should execute shell commands successfully', async () => {
    const result = await executeShellTool.execute({
      context: {
        command: 'echo "Hello Shell"',
      },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Hello Shell');
  });

  it('should handle command errors gracefully', async () => {
    const result = await executeShellTool.execute({
      context: {
        command: 'exit 1',
      },
      runtimeContext: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should support working directory', async () => {
    const result = await executeShellTool.execute({
      context: {
        command: 'pwd',
        cwd: '/tmp',
      },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('/tmp');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test execute-shell.tool.test.ts`
Expected: FAIL with "Cannot find module './execute-shell.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/execute-shell.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const executeShellTool = createTool({
  id: 'execute-shell' as const,
  description: 'Execute shell commands with optional working directory',

  inputSchema: z.object({
    command: z.string().describe('Shell command to execute'),
    cwd: z.string().optional().describe('Working directory for command execution'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { command, cwd } = context;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout?.trim(),
        stderr: error.stderr?.trim(),
        error: error.message,
      };
    }
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test execute-shell.tool.test.ts`
Expected: PASS - 3 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/execute-shell.tool.ts apps/mastra/src/mastra/tools/execute-shell.tool.test.ts
git commit -m "feat: add execute-shell tool for curator agent"
```

---

### Task 5: Get Environment Variable Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/get-env.tool.ts`
- Test: `apps/mastra/src/mastra/tools/get-env.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/get-env.tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnvTool } from './get-env.tool';

describe('getEnvTool', () => {
  const testKey = 'TEST_ENV_VAR_12345';

  beforeEach(() => {
    process.env[testKey] = 'test-value';
  });

  afterEach(() => {
    delete process.env[testKey];
  });

  it('should get environment variable value', async () => {
    const result = await getEnvTool.execute({
      context: { key: testKey },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe('test-value');
  });

  it('should handle missing env vars gracefully', async () => {
    const result = await getEnvTool.execute({
      context: { key: 'NONEXISTENT_KEY' },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.value).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test get-env.tool.test.ts`
Expected: FAIL with "Cannot find module './get-env.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/get-env.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getEnvTool = createTool({
  id: 'get-env' as const,
  description: 'Get the value of an environment variable',

  inputSchema: z.object({
    key: z.string().describe('Environment variable key to retrieve'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    value: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { key } = context;

    return {
      success: true,
      value: process.env[key],
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test get-env.tool.test.ts`
Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/get-env.tool.ts apps/mastra/src/mastra/tools/get-env.tool.test.ts
git commit -m "feat: add get-env tool for curator agent"
```

---

### Task 6: Check Environment Variable Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/check-env.tool.ts`
- Test: `apps/mastra/src/mastra/tools/check-env.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/check-env.tool.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkEnvTool } from './check-env.tool';

describe('checkEnvTool', () => {
  const testKey = 'TEST_ENV_VAR_67890';

  beforeEach(() => {
    process.env[testKey] = 'exists';
  });

  afterEach(() => {
    delete process.env[testKey];
  });

  it('should return true for existing env var', async () => {
    const result = await checkEnvTool.execute({
      context: { key: testKey },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.exists).toBe(true);
  });

  it('should return false for missing env var', async () => {
    const result = await checkEnvTool.execute({
      context: { key: 'NONEXISTENT_KEY' },
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.exists).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test check-env.tool.test.ts`
Expected: FAIL with "Cannot find module './check-env.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/check-env.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const checkEnvTool = createTool({
  id: 'check-env' as const,
  description: 'Check if an environment variable exists',

  inputSchema: z.object({
    key: z.string().describe('Environment variable key to check'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    exists: z.boolean(),
  }),

  execute: async ({ context }) => {
    const { key } = context;

    return {
      success: true,
      exists: process.env[key] !== undefined,
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test check-env.tool.test.ts`
Expected: PASS - 2 tests passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/check-env.tool.ts apps/mastra/src/mastra/tools/check-env.tool.test.ts
git commit -m "feat: add check-env tool for curator agent"
```

---

## Phase 2: Create Curator Agent

### Task 7: Function Curator Agent

**Files:**
- Create: `apps/mastra/src/mastra/agents/function-curator-agent.ts`
- Test: `apps/mastra/src/mastra/agents/function-curator-agent.test.ts`
- Modify: `apps/mastra/src/mastra/index.ts` (register agent)

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/agents/function-curator-agent.test.ts
import { describe, it, expect } from 'vitest';
import { functionCuratorAgent } from './function-curator-agent';

describe('functionCuratorAgent', () => {
  it('should be defined with correct name', () => {
    expect(functionCuratorAgent).toBeDefined();
    expect(functionCuratorAgent.name).toBe('Function Curator');
  });

  it('should have required tools', () => {
    const tools = Object.keys(functionCuratorAgent.tools || {});

    // Function management tools
    expect(tools).toContain('search-functions');
    expect(tools).toContain('get-function-metadata');
    expect(tools).toContain('execute-function');

    // File operations
    expect(tools).toContain('read-file');
    expect(tools).toContain('write-file');
    expect(tools).toContain('list-directory');

    // Shell and env
    expect(tools).toContain('execute-shell');
    expect(tools).toContain('get-env');
    expect(tools).toContain('check-env');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test function-curator-agent.test.ts`
Expected: FAIL with "Cannot find module './function-curator-agent'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/agents/function-curator-agent.ts
import { Agent } from '@mastra/core/agent';

// Function management tools (already exist)
import { searchFunctionsTool } from '../tools/search-functions.tool';
import { getFunctionMetadataTool } from '../tools/get-function-metadata.tool';
import { executeFunctionTool } from '../tools/execute-function.tool';

// New curator tools
import { readFileTool } from '../tools/read-file.tool';
import { writeFileTool } from '../tools/write-file.tool';
import { listDirectoryTool } from '../tools/list-directory.tool';
import { executeShellTool } from '../tools/execute-shell.tool';
import { getEnvTool } from '../tools/get-env.tool';
import { checkEnvTool } from '../tools/check-env.tool';

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

      // File operations
      [readFileTool.id]: readFileTool,
      [writeFileTool.id]: writeFileTool,
      [listDirectoryTool.id]: listDirectoryTool,

      // Shell access
      [executeShellTool.id]: executeShellTool,

      // Environment
      [getEnvTool.id]: getEnvTool,
      [checkEnvTool.id]: checkEnvTool,
    },
  });
}

export const functionCuratorAgent = await createFunctionCuratorAgent();
```

**Step 4: Register agent in Mastra instance**

```typescript
// apps/mastra/src/mastra/index.ts
// Add import
import { functionCuratorAgent } from './agents/function-curator-agent';

// In Mastra constructor, add to agents
export const mastra = new Mastra({
  agents: {
    vargosAgent,
    functionCuratorAgent, // ADD THIS
  },
  workflows: {
    createFunctionWorkflow,
  },
});
```

**Step 5: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test function-curator-agent.test.ts`
Expected: PASS - 2 tests passing

**Step 6: Commit**

```bash
git add apps/mastra/src/mastra/agents/function-curator-agent.ts apps/mastra/src/mastra/agents/function-curator-agent.test.ts apps/mastra/src/mastra/index.ts
git commit -m "feat: add function curator agent with full toolkit"
```

---

## Phase 3: Build Workflow

### Task 8: Curate Function Workflow

**Files:**
- Create: `apps/mastra/src/mastra/workflows/curate-function-workflow.ts`
- Test: `apps/mastra/src/mastra/workflows/curate-function-workflow.test.ts`
- Modify: `apps/mastra/src/mastra/index.ts` (register workflow)

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/workflows/curate-function-workflow.test.ts
import { describe, it, expect, vi } from 'vitest';
import { curateFunctionWorkflow } from './curate-function-workflow';

describe('curateFunctionWorkflow', () => {
  it('should have correct input schema', () => {
    expect(curateFunctionWorkflow.inputSchema).toBeDefined();

    const result = curateFunctionWorkflow.inputSchema.safeParse({
      userRequest: 'Create a function to get weather',
    });

    expect(result.success).toBe(true);
  });

  it('should have correct output schema', () => {
    expect(curateFunctionWorkflow.outputSchema).toBeDefined();

    const result = curateFunctionWorkflow.outputSchema.safeParse({
      success: true,
      message: 'Function created',
    });

    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test curate-function-workflow.test.ts`
Expected: FAIL with "Cannot find module './curate-function-workflow'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/workflows/curate-function-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { getFunctionsService } from '../services/functions.service';

const inputSchema = z.object({
  userRequest: z.string().describe('What the user wants to accomplish'),
});

// Step 1: Invoke Curator (fully autonomous)
const invokeCurator = createStep({
  id: 'invoke-curator',
  description: 'Curator handles entire curation process autonomously',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    functionName: z.string(),
    action: z.enum(['created', 'edited', 'fixed', 'optimized']),
    message: z.string(),
    userRequest: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { userRequest } = inputData;

    // Get curator agent from Mastra registry
    const { mastra } = await import('../index');
    const curatorAgent = mastra.getAgent('function-curator');

    // Just pass the raw request - curator drives everything
    const result = await curatorAgent.generate(userRequest);

    // Parse result (curator should return JSON)
    let parsed: any;
    try {
      parsed = typeof result === 'string' ? JSON.parse(result) : result;
    } catch {
      return {
        success: false,
        functionName: '',
        action: 'created' as const,
        message: 'Failed to parse curator response',
        userRequest,
      };
    }

    return {
      success: parsed.success || false,
      functionName: parsed.functionName || '',
      action: parsed.action || 'created',
      message: parsed.message || '',
      userRequest,
    };
  },
});

// Step 2: Reindex Function (only if changed)
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

    try {
      // Reindex the function
      const functionsService = await getFunctionsService();
      await functionsService.reindexFunction(functionName);

      return {
        success: true,
        message: `Function "${functionName}" ${action} and indexed successfully`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Function ${action} but indexing failed: ${errorMessage}`,
      };
    }
  },
});

// Create workflow
export const curateFunctionWorkflow = createWorkflow({
  id: 'curate-function',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})
  .then(invokeCurator)
  .then(indexFunction);

curateFunctionWorkflow.commit();
```

**Step 4: Register workflow**

```typescript
// apps/mastra/src/mastra/index.ts
// Add import
import { curateFunctionWorkflow } from './workflows/curate-function-workflow';

// In Mastra constructor, add to workflows
export const mastra = new Mastra({
  agents: {
    vargosAgent,
    functionCuratorAgent,
  },
  workflows: {
    createFunctionWorkflow,
    curateFunctionWorkflow, // ADD THIS
  },
});
```

**Step 5: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test curate-function-workflow.test.ts`
Expected: PASS - 2 tests passing

**Step 6: Commit**

```bash
git add apps/mastra/src/mastra/workflows/curate-function-workflow.ts apps/mastra/src/mastra/workflows/curate-function-workflow.test.ts apps/mastra/src/mastra/index.ts
git commit -m "feat: add curate-function workflow with 2-step process"
```

---

## Phase 4: Integrate with Vargos Agent

### Task 9: Curate Function Tool

**Files:**
- Create: `apps/mastra/src/mastra/tools/curate-function.tool.ts`
- Test: `apps/mastra/src/mastra/tools/curate-function.tool.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/mastra/src/mastra/tools/curate-function.tool.test.ts
import { describe, it, expect } from 'vitest';
import { curateFunctionTool } from './curate-function.tool';

describe('curateFunctionTool', () => {
  it('should have correct schema', () => {
    expect(curateFunctionTool.id).toBe('curate-function');

    const inputResult = curateFunctionTool.inputSchema.safeParse({
      userRequest: 'Create weather function',
    });

    expect(inputResult.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/mastra && pnpm test curate-function.tool.test.ts`
Expected: FAIL with "Cannot find module './curate-function.tool'"

**Step 3: Write minimal implementation**

```typescript
// apps/mastra/src/mastra/tools/curate-function.tool.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { curateFunctionWorkflow } from '../workflows/curate-function-workflow';

export const curateFunctionTool = createTool({
  id: 'curate-function' as const,
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

**Step 4: Run test to verify it passes**

Run: `cd apps/mastra && pnpm test curate-function.tool.test.ts`
Expected: PASS - 1 test passing

**Step 5: Commit**

```bash
git add apps/mastra/src/mastra/tools/curate-function.tool.ts apps/mastra/src/mastra/tools/curate-function.tool.test.ts
git commit -m "feat: add curate-function tool wrapping workflow"
```

---

### Task 10: Update Vargos Agent

**Files:**
- Modify: `apps/mastra/src/mastra/agents/vargos-agent.ts`

**Step 1: Update agent instructions**

```typescript
// apps/mastra/src/mastra/agents/vargos-agent.ts
// Update instructions
instructions: `
You are a self-curative Vargos assistant that helps users by utilizing existing functions or creating new ones when needed.

## Your Workflow

1. **Try existing functions first:**
   - You have RAG context of available functions (future feature)
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
`,
```

**Step 2: Add curate-function tool to Vargos Agent**

```typescript
// apps/mastra/src/mastra/agents/vargos-agent.ts
// Add import
import { curateFunctionTool } from '../tools/curate-function.tool';

// In tools object
tools: {
  // Function management (for discovery and execution)
  [listFunctionsTool.id]: listFunctionsTool,
  [searchFunctionsTool.id]: searchFunctionsTool,
  [executeFunctionTool.id]: executeFunctionTool,
  [getFunctionMetadataTool.id]: getFunctionMetadataTool,

  // Curation (fallback when no existing function works)
  [curateFunctionTool.id]: curateFunctionTool, // ADD THIS

  // Other orchestration tools
  [invokeAgentTool.id]: invokeAgentTool,
  [executeWorkflowTool.id]: executeWorkflowTool,
  [runInBackgroundTool.id]: runInBackgroundTool,
}
```

**Step 3: Run type check**

Run: `cd apps/mastra && pnpm build`
Expected: PASS - No TypeScript errors

**Step 4: Commit**

```bash
git add apps/mastra/src/mastra/agents/vargos-agent.ts
git commit -m "feat: integrate curate-function tool into Vargos Agent"
```

---

## Phase 5: Deprecate Old System (Optional)

### Task 11: Remove Old Create Function Tool and Workflow

**Files:**
- Delete: `apps/mastra/src/mastra/tools/create-function.tool.ts`
- Delete: `apps/mastra/src/mastra/workflows/create-function-workflow.ts`
- Modify: `apps/mastra/src/mastra/agents/vargos-agent.ts` (remove import)
- Modify: `apps/mastra/src/mastra/index.ts` (remove workflow registration)

**Step 1: Remove create-function tool from Vargos Agent**

```typescript
// apps/mastra/src/mastra/agents/vargos-agent.ts
// Remove import
- import { createFunctionTool } from '../tools/create-function.tool';

// Remove from tools object
- [createFunctionTool.id]: createFunctionTool,
```

**Step 2: Remove workflow registration**

```typescript
// apps/mastra/src/mastra/index.ts
// Remove import
- import { createFunctionWorkflow } from './workflows/create-function-workflow';

// Remove from workflows
workflows: {
-  createFunctionWorkflow,
   curateFunctionWorkflow,
}
```

**Step 3: Delete old files**

Run: `git rm apps/mastra/src/mastra/tools/create-function.tool.ts apps/mastra/src/mastra/workflows/create-function-workflow.ts`
Expected: Files removed from git

**Step 4: Run type check**

Run: `cd apps/mastra && pnpm build`
Expected: PASS - No TypeScript errors

**Step 5: Commit**

```bash
git commit -m "refactor: remove deprecated create-function tool and workflow"
```

---

## Testing & Verification

### Task 12: End-to-End Test

**Manual test steps:**

1. **Start Mastra:**
   ```bash
   cd apps/mastra && pnpm dev
   ```

2. **Test with Vargos Agent:**
   ```bash
   curl http://localhost:4862/api/agents/vargos/generate \
     -H "Content-Type: application/json" \
     -d '{"query": "Create a function to get current time in a specific timezone"}'
   ```

3. **Expected behavior:**
   - Agent searches for existing time/timezone functions
   - Finds none (or similar ones)
   - Offers to create the function
   - (In real scenario, user would confirm)
   - Curator creates complete implementation
   - Function indexed
   - Ready to use

4. **Verify function created:**
   ```bash
   ls $FUNCTIONS_DIR/get-timezone-time/
   # Should show: index.ts, get-timezone-time.meta.json
   ```

5. **Test function execution:**
   ```bash
   curl http://localhost:4862/api/agents/vargos/generate \
     -H "Content-Type: application/json" \
     -d '{"query": "Get current time in America/New_York"}'
   ```

6. **Expected:** Function executes and returns current time

**Step 6: Document test results**

Create: `apps/mastra/docs/TEST_RESULTS.md`

```markdown
# Function Curation System - Test Results

**Date:** [Current Date]

## Phase 1: Curator Tools
- ✅ read-file tool: PASS
- ✅ write-file tool: PASS
- ✅ list-directory tool: PASS
- ✅ execute-shell tool: PASS
- ✅ get-env tool: PASS
- ✅ check-env tool: PASS

## Phase 2: Curator Agent
- ✅ function-curator-agent: PASS

## Phase 3: Workflow
- ✅ curate-function-workflow: PASS

## Phase 4: Integration
- ✅ curate-function tool: PASS
- ✅ Vargos Agent integration: PASS

## End-to-End Testing
- [ ] Create new function: [RESULT]
- [ ] Edit existing function: [RESULT]
- [ ] Function execution: [RESULT]

## Notes
[Add any observations or issues]
```

**Step 7: Commit test results**

```bash
git add apps/mastra/docs/TEST_RESULTS.md
git commit -m "docs: add test results for function curation system"
```

---

## Summary

**Total Tasks:** 12 tasks
**Total Steps:** ~70 individual steps
**Estimated Time:** 3-4 hours

**Key Deliverables:**
1. 6 new curator tools (file I/O, shell, env)
2. Function curator agent with full toolkit
3. Simplified 2-step curation workflow
4. Integration with Vargos Agent
5. Deprecated old template system
6. Comprehensive test coverage

**Next Steps After Implementation:**
1. Monitor curator quality metrics
2. Implement RAG for Vargos Agent (future enhancement)
3. Add test generation capability to curator
4. Optimize curator prompts based on usage patterns
