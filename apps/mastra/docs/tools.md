# Vargos Tools & Services Reference

This document provides a comprehensive reference for all Vargos tools and core services, including their APIs, usage patterns, and integration points.

## Table of Contents

- [Overview](#overview)
- [Tool Architecture](#tool-architecture)
- [Functions Domain Tools](#functions-domain-tools)
- [Environment Domain Tools](#environment-domain-tools)
- [Shell Domain Tools](#shell-domain-tools)
- [Memory Domain Tools](#memory-domain-tools)
- [Orchestration Tools](#orchestration-tools)
- [Core Services](#core-services)
- [Service Integration](#service-integration)

## Overview

Vargos tools follow a **1:1 passthrough pattern** where each tool is a thin wrapper around a core service. This architecture provides:

- **Consistency** - All tools follow same structure
- **Type Safety** - Zod schemas for inputs/outputs
- **Simplicity** - No business logic in tools
- **Testability** - Easy to test and mock

### Tool Structure

All tools are created using `createTool` from `@mastra/core/tools`:

```typescript
import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const exampleTool = createTool({
  id: 'example-tool' as const,
  description: 'Brief description of what this tool does',

  inputSchema: z.object({
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Optional param2'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
  }),

  execute: async ({ context }) => {
    const { param1, param2 } = context;

    try {
      const coreServices = getCoreServices();
      const result = await coreServices.someService.doSomething(param1, param2);

      return {
        success: true,
        result: result.data,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute: ${errorMessage}`);
    }
  },
});
```

## Tool Architecture

### 1:1 Passthrough Pattern

```
Agent → Tool → Core Service → External System
```

**Example Flow:**
```
curatorAgent
  → searchFunctionsTool
    → functionsService.searchFunctions()
      → Qdrant Vector DB
```

### Tool Registration

Tools are organized by domain and exported from index files:

```typescript
// src/mastra/tools/functions/index.ts
export { listFunctionsTool } from './list-functions.tool';
export { searchFunctionsTool } from './search-functions.tool';
export { getFunctionMetadataTool } from './get-function-metadata.tool';
export { executeFunctionTool } from './execute-function.tool';
```

### Agent Tool Usage

Agents access tools via their `tools` configuration:

```typescript
import { searchFunctionsTool } from '../tools/functions';

const agent = new Agent({
  name: 'Curator Agent',
  tools: {
    [searchFunctionsTool.id]: searchFunctionsTool,
  },
});
```

## Functions Domain Tools

**Location:** `src/mastra/tools/functions/`

### list-functions

**File:** `list-functions.tool.ts`

**Purpose:** List all available functions in the repository

**Input Schema:**
```typescript
z.object({})  // No inputs required
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  functions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.union([z.string(), z.array(z.string())]),
    tags: z.array(z.string()),
  })),
  total: z.number(),
})
```

**Usage:**
```typescript
const result = await listFunctionsTool.execute({ context: {} });

console.log(`Found ${result.total} functions`);
result.functions.forEach(fn => {
  console.log(`- ${fn.name}: ${fn.description}`);
});
```

**Core Service:** `functionsService.listFunctions()`

---

### search-functions

**File:** `search-functions.tool.ts`

**Purpose:** Semantic search for functions using vector similarity

**Input Schema:**
```typescript
z.object({
  query: z.string().describe('Natural language search query'),
  limit: z.number().optional().describe('Max results (default: 5)'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  results: z.array(z.object({
    functionId: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.union([z.string(), z.array(z.string())]),
    score: z.number(),  // Similarity score (0-1)
  })),
  query: z.string(),
})
```

**Usage:**
```typescript
const result = await searchFunctionsTool.execute({
  context: {
    query: 'send emails via SendGrid',
    limit: 3,
  }
});

result.results.forEach(fn => {
  console.log(`${fn.name} (score: ${fn.score})`);
});
```

**Core Service:** `functionsService.searchFunctions(query, limit)`

**Vector DB:** Uses Qdrant for semantic similarity

---

### get-function-metadata

**File:** `get-function-metadata.tool.ts`

**Purpose:** Get detailed metadata for a specific function

**Input Schema:**
```typescript
z.object({
  functionId: z.string().describe('Function ID to retrieve'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  metadata: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    version: z.string(),
    category: z.union([z.string(), z.array(z.string())]),
    tags: z.array(z.string()),
    requiredEnvVars: z.array(z.string()),
    input: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      defaultValue: z.string().optional(),
    })),
    output: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
    })),
  }),
})
```

**Usage:**
```typescript
const result = await getFunctionMetadataTool.execute({
  context: { functionId: 'send-email-sendgrid' }
});

console.log('Function:', result.metadata.name);
console.log('Version:', result.metadata.version);
console.log('Required Env Vars:', result.metadata.requiredEnvVars);
```

**Core Service:** `functionsService.getFunctionMetadata(functionId)`

---

### execute-function

**File:** `execute-function.tool.ts`

**Purpose:** Execute a function with provided input

**Input Schema:**
```typescript
z.object({
  functionId: z.string().describe('Function ID to execute'),
  input: z.record(z.any()).describe('Function input parameters as key-value pairs'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  output: z.any(),
  executionTime: z.number().optional(),
  error: z.string().optional(),
})
```

**Usage:**
```typescript
const result = await executeFunctionTool.execute({
  context: {
    functionId: 'send-email-sendgrid',
    input: {
      to: 'user@example.com',
      subject: 'Test Email',
      content: 'Hello from Vargos!',
    }
  }
});

if (result.success) {
  console.log('Email sent:', result.output);
} else {
  console.error('Failed:', result.error);
}
```

**Core Service:** `functionsService.executeFunction(functionId, input)`

**Execution:** Functions run in isolated subprocess via pnpm

---

### create-function

**File:** `create-function.tool.ts`

**Purpose:** Create a new function with code, tests, and metadata

**Input Schema:**
```typescript
z.object({
  name: z.string().describe('Function name (kebab-case)'),
  description: z.string(),
  version: z.string(),
  category: z.union([z.string(), z.array(z.string())]),
  tags: z.array(z.string()),
  requiredEnvVars: z.array(z.string()),
  input: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    defaultValue: z.string().optional(),
  })),
  output: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
  })),
  code: z.string().describe('Function implementation code'),
  tests: z.string().describe('Test file code'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  functionId: z.string(),
  path: z.string(),
  filesCreated: z.array(z.string()),
})
```

**Usage:**
```typescript
const result = await createFunctionTool.execute({
  context: {
    name: 'send-email',
    description: 'Send emails via SendGrid',
    version: '1.0.0',
    category: 'communication',
    tags: ['email', 'sendgrid'],
    requiredEnvVars: ['SENDGRID_API_KEY'],
    input: [/* ... */],
    output: [/* ... */],
    code: '/* TypeScript code */',
    tests: '/* Test code */',
  }
});

console.log('Created function at:', result.path);
console.log('Files:', result.filesCreated);
```

**Core Service:** `functionsService.createFunction(metadata, code, tests)`

**File Structure Created:**
```
~/.vargos/functions/src/category/function-name/v1/
├── index.ts                  # Implementation
├── function-name.meta.json   # Metadata
└── function-name.test.ts     # Tests
```

---

### test-function

**File:** `test-function.tool.ts`

**Purpose:** Run vitest tests for a specific function

**Input Schema:**
```typescript
z.object({
  functionId: z.string().describe('Function ID to test'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  passed: z.boolean(),
  testResults: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
})
```

**Usage:**
```typescript
const result = await testFunctionTool.execute({
  context: { functionId: 'send-email-sendgrid' }
});

if (result.passed) {
  console.log(`All ${result.testResults.total} tests passed!`);
} else {
  console.error('Test failures:', result.stderr);
}
```

**Core Service:** `functionsService.testFunction(functionId)`

**Test Runner:** Vitest via subprocess

---

## Environment Domain Tools

**Location:** `src/mastra/tools/env/`

### get-env

**File:** `get-env.tool.ts`

**Purpose:** Get environment variable value

**Input Schema:**
```typescript
z.object({
  key: z.string().describe('Environment variable key'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  value: z.string().optional(),
})
```

**Usage:**
```typescript
const result = await getEnvTool.execute({
  context: { key: 'OPENAI_API_KEY' }
});

console.log('Value:', result.value);
```

**Core Service:** `envService.get(key)`

**Provider:** `FilepathEnvProvider` (.env file operations)

---

### set-env

**File:** `set-env.tool.ts`

**Purpose:** Set environment variable value

**Input Schema:**
```typescript
z.object({
  key: z.string().describe('Environment variable key'),
  value: z.string().describe('Value to set'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
})
```

**Usage:**
```typescript
const result = await setEnvTool.execute({
  context: {
    key: 'SENDGRID_API_KEY',
    value: 'SG.xxx...',
  }
});
```

**Core Service:** `envService.set(key, value)`

**Side Effect:** Writes to .env file (or .env.test in test mode)

---

### search-env

**File:** `search-env.tool.ts`

**Purpose:** Search environment variables by pattern

**Input Schema:**
```typescript
z.object({
  query: z.string().describe('Search pattern (substring match)'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  results: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })),
})
```

**Usage:**
```typescript
const result = await searchEnvTool.execute({
  context: { query: 'API_KEY' }
});

result.results.forEach(env => {
  console.log(`${env.key}=${env.value}`);
});
```

**Core Service:** `envService.search(query)`

---

## Shell Domain Tools

**Location:** `src/mastra/tools/shell/`

### bash

**File:** `bash.tool.ts`

**Purpose:** Execute bash commands in persistent session

**Input Schema:**
```typescript
z.object({
  command: z.string().describe('Bash command to execute'),
  sessionId: z.string().optional().describe('Session ID (default: creates new)'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  sessionId: z.string(),
})
```

**Usage:**
```typescript
// Execute command
const result = await bashTool.execute({
  context: { command: 'ls -la' }
});

console.log('Output:', result.output);

// Persistent session
const session1 = await bashTool.execute({
  context: { command: 'cd /tmp' }
});

const session2 = await bashTool.execute({
  context: {
    command: 'pwd',
    sessionId: session1.sessionId  // Uses same session
  }
});
```

**Core Service:** `shellService.execute(command, sessionId)`

**Session Management:** Shell sessions persist across commands

---

### bash-history

**File:** `bash-history.tool.ts`

**Purpose:** View command history for a session

**Input Schema:**
```typescript
z.object({
  sessionId: z.string().describe('Shell session ID'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  history: z.array(z.string()),
})
```

**Usage:**
```typescript
const result = await bashHistoryTool.execute({
  context: { sessionId: 'session-123' }
});

console.log('Command history:');
result.history.forEach((cmd, i) => {
  console.log(`${i + 1}. ${cmd}`);
});
```

**Core Service:** `shellService.getHistory(sessionId)`

---

### bash-interrupt

**File:** `bash-interrupt.tool.ts`

**Purpose:** Stop running command in session

**Input Schema:**
```typescript
z.object({
  sessionId: z.string().describe('Shell session ID'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
})
```

**Usage:**
```typescript
const result = await bashInterruptTool.execute({
  context: { sessionId: 'session-123' }
});

console.log('Command interrupted');
```

**Core Service:** `shellService.interrupt(sessionId)`

**Process Management:** Sends SIGINT to running command

---

## Memory Domain Tools

**Location:** `src/mastra/tools/memory/`

### search-memory

**File:** `search-memory.tool.ts`

**Purpose:** Query conversation history from PostgreSQL

**Input Schema:**
```typescript
z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().describe('Max results'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  memories: z.array(z.object({
    id: z.string(),
    content: z.string(),
    timestamp: z.string(),
    relevance: z.number(),
  })),
})
```

**Usage:**
```typescript
const result = await searchMemoryTool.execute({
  context: {
    query: 'email function',
    limit: 5,
  }
});

result.memories.forEach(mem => {
  console.log(`[${mem.timestamp}] ${mem.content}`);
});
```

**Storage:** PostgreSQL via pgMemory

---

## Orchestration Tools

**Location:** `src/mastra/tools/orchestration/`

### delegate-to-curator

**Purpose:** Hand off request to Curator Agent

**Input Schema:**
```typescript
z.object({
  query: z.string().describe('Search query or function request'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  curatorResponse: CuratorOutputSchema,  // From curator agent
})
```

**Usage:**
```typescript
const result = await delegateToCuratorTool.execute({
  context: { query: 'find email sending functions' }
});

if (result.curatorResponse.decision === 'use_existing') {
  const functionId = result.curatorResponse.topMatch.functionId;
  // Execute function
}
```

---

### delegate-to-creator

**Purpose:** Hand off request to Function Creator Agent

**Input Schema:**
```typescript
z.object({
  specification: z.string().describe('Function requirements'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  creatorResponse: FunctionGenerationSchema,  // From creator agent
})
```

---

### delegate-to-sandbox

**Purpose:** Hand off request to Sandbox Agent for testing

**Input Schema:**
```typescript
z.object({
  functionId: z.string().describe('Function to test'),
})
```

**Output Schema:**
```typescript
z.object({
  success: z.boolean(),
  sandboxResponse: TestAnalysisSchema,  // From sandbox agent
})
```

---

## Core Services

**Location:** `packages/core-lib/src/`

Core services are singleton instances that provide system capabilities. All services are initialized via `createCoreServices()`.

### Service Initialization

**File:** `apps/mastra/src/mastra/services/core.service.ts`

```typescript
// Initialize once at startup
await initializeCoreServices();

// Get services
const coreServices = getCoreServices();

// Access individual services
coreServices.llmService
coreServices.vectorService
coreServices.functionsService
coreServices.envService
coreServices.shellService
```

**Configuration:**
```typescript
const coreServices = await createCoreServices({
  llm: {
    provider: 'openai',
    config: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
  },
  vector: {
    provider: 'qdrant',
    config: {
      url: process.env.QDRANT_URL || '',
      apiKey: process.env.QDRANT_API_KEY || '',
    },
  },
  functions: {
    provider: 'local-directory',
    config: {
      functionsDir: process.env.FUNCTIONS_DIR,
    },
  },
  env: {
    provider: 'filepath',
    config: {
      envFilePath: '.env',
    },
  },
  shell: {
    config: {
      dataDir: process.env.DATA_DIR || '/tmp',
      shellPath: '/bin/bash',
    },
  },
});
```

---

### LLM Service

**File:** `packages/core-lib/src/llm/llm.service.ts`

**Purpose:** OpenAI API integration for embeddings and chat

**Key Methods:**

```typescript
// Generate embeddings for text
async generateEmbeddings(texts: string[]): Promise<number[][]>

// Get embedding for single text
async getEmbedding(text: string): Promise<number[]>

// Chat completion (future)
async chat(messages: Message[]): Promise<string>
```

**Example:**
```typescript
const llmService = coreServices.llmService;

// Generate embeddings for semantic search
const embeddings = await llmService.generateEmbeddings([
  'send emails via SendGrid',
  'fetch weather data',
]);

console.log('Embedding dimensions:', embeddings[0].length);
```

**Provider:** OpenAI API (text-embedding-3-small model)

**Usage:** Vector search indexing for function repository

---

### Vector Service

**File:** `packages/core-lib/src/vector/vector.service.ts`

**Purpose:** Qdrant vector database integration for semantic search

**Key Methods:**

```typescript
// Search by text query
async search(query: string, limit: number): Promise<SearchResult[]>

// Upsert vector points
async upsert(points: VectorPoint[]): Promise<void>

// Delete points
async delete(ids: string[]): Promise<void>

// Check collection exists
async collectionExists(name: string): Promise<boolean>

// Create collection
async createCollection(name: string, dimensions: number): Promise<void>
```

**Example:**
```typescript
const vectorService = coreServices.vectorService;

// Search for similar functions
const results = await vectorService.search(
  'send emails',
  5  // Top 5 results
);

results.forEach(result => {
  console.log(`${result.payload.name} (score: ${result.score})`);
});
```

**Provider:** Qdrant (local or cloud)

**Collection:** `vargos-functions` (auto-created)

**Index Structure:**
```typescript
{
  id: string,           // Function ID
  vector: number[],     // Embedding (1536 dimensions)
  payload: {
    name: string,
    description: string,
    category: string | string[],
    tags: string[],
  }
}
```

---

### Functions Service

**File:** `packages/core-lib/src/functions/functions.service.ts`

**Purpose:** Function repository management and execution

**Key Methods:**

```typescript
// List all functions
async listFunctions(): Promise<ListFunctionsResult>

// Search functions semantically
async searchFunctions(query: string, limit: number): Promise<SearchResult[]>

// Get function metadata
async getFunctionMetadata(functionId: string): Promise<FunctionMetadata>

// Execute function
async executeFunction(functionId: string, input: unknown): Promise<ExecutionResult>

// Create function
async createFunction(
  metadata: FunctionMetadata,
  code: string,
  tests: string
): Promise<CreateResult>

// Test function
async testFunction(functionId: string): Promise<TestResult>

// Index functions for search
async indexFunctions(): Promise<void>
```

**Example:**
```typescript
const functionsService = coreServices.functionsService;

// Search for function
const results = await functionsService.searchFunctions('email', 3);
const functionId = results[0].functionId;

// Get metadata
const metadata = await functionsService.getFunctionMetadata(functionId);
console.log('Required env vars:', metadata.requiredEnvVars);

// Execute function
const output = await functionsService.executeFunction(functionId, {
  to: 'user@example.com',
  subject: 'Test',
  content: 'Hello!',
});

console.log('Result:', output);
```

**Repository Structure:**
```
~/.vargos/functions/src/
├── category-name/
│   └── function-name/
│       ├── v1/
│       │   ├── index.ts
│       │   ├── function-name.meta.json
│       │   └── function-name.test.ts
│       └── v2/  (if exists)
```

**Execution:** Functions run via `pnpm tsx` in isolated subprocess

**Versioning:** Supports semantic versioning (v1, v2, v3, etc.)

---

### Env Service

**File:** `packages/core-lib/src/env/env.service.ts`

**Purpose:** Environment variable management with .env file operations

**Key Methods:**

```typescript
// Get environment variable
get(key: string): string | undefined

// Set environment variable
async set(key: string, value: string): Promise<void>

// Search environment variables
search(query: string): EnvVariable[]

// Delete environment variable
async delete(key: string): Promise<void>

// Get all environment variables
getAll(): Record<string, string>
```

**Example:**
```typescript
const envService = coreServices.envService;

// Get variable
const apiKey = envService.get('OPENAI_API_KEY');

// Set variable (writes to .env file)
await envService.set('SENDGRID_API_KEY', 'SG.xxx...');

// Search variables
const apiKeys = envService.search('API_KEY');
apiKeys.forEach(env => {
  console.log(`${env.key}=${env.value}`);
});
```

**Provider:** `FilepathEnvProvider` (default)

**Test Isolation:** Automatically uses `.env.test` when `NODE_ENV=test`

**File Operations:**
- Reads .env file
- Writes updates atomically
- Preserves comments and formatting

---

### Shell Service

**File:** `packages/core-lib/src/shell/shell.service.ts`

**Purpose:** Persistent shell session management

**Key Methods:**

```typescript
// Execute command
async execute(command: string, sessionId?: string): Promise<string>

// Get command history
getHistory(sessionId: string): string[]

// Interrupt running command
interrupt(sessionId: string): void

// Create new session
createSession(): string

// Delete session
deleteSession(sessionId: string): void
```

**Example:**
```typescript
const shellService = coreServices.shellService;

// Execute command
const output = await shellService.execute('ls -la');
console.log(output);

// Persistent session
const sessionId = shellService.createSession();

await shellService.execute('cd /tmp', sessionId);
await shellService.execute('pwd', sessionId);  // Prints /tmp

// View history
const history = shellService.getHistory(sessionId);
console.log('Commands:', history);

// Cleanup
shellService.deleteSession(sessionId);
```

**Session Management:**
- Each session has isolated working directory
- Commands execute in sequence
- History tracked per session
- Supports interrupts (SIGINT)

**Storage:** Session data stored in `DATA_DIR` (configurable)

---

## Service Integration

### Singleton Pattern

All services use singleton pattern for efficiency:

```typescript
// Service cached after first initialization
let coreServices: CoreServices | null = null;

export async function initializeCoreServices(): Promise<CoreServices> {
  if (coreServices) {
    return coreServices;  // Return cached instance
  }

  coreServices = await createCoreServices({
    // config
  });

  return coreServices;
}
```

**Benefits:**
- Services initialized once
- Shared across all tools and agents
- Efficient resource usage (DB connections, etc.)
- Test mode automatically isolated

### Test Mode

In test mode (`NODE_ENV=test`), services are recreated for isolation:

```typescript
const isTestMode = process.env.NODE_ENV === 'test';

if (coreServices && !isTestMode) {
  return coreServices;  // Use cached
}

// In test mode, always recreate
coreServices = await createCoreServices({
  env: {
    provider: 'filepath',
    config: {
      envFilePath: isTestMode ? '.env.test' : '.env',
    },
  },
  // ...
});
```

**Test Isolation:**
- Uses `.env.test` file
- Temporary directories for data
- Fresh service instances per test suite
- No pollution of production environment

### Error Handling

All tools follow consistent error handling:

```typescript
try {
  const coreServices = getCoreServices();
  const result = await coreServices.someService.doSomething();

  return {
    success: true,
    result,
  };
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to execute: ${errorMessage}`);
}
```

**Error Flow:**
1. Tool catches service errors
2. Wraps in descriptive message
3. Throws to agent
4. Agent handles in structured output

---

## Best Practices

### Tool Development

1. **Keep tools thin** - No business logic, just passthrough
2. **Use Zod schemas** - Type-safe inputs and outputs
3. **Clear descriptions** - Help agents understand tool purpose
4. **Consistent error handling** - Always wrap errors with context
5. **Test with core services** - Initialize services in tests

### Example Tool Template

```typescript
import { createTool } from '@mastra/core/tools';
import { getCoreServices } from '../../services/core.service';
import { z } from 'zod';

export const myTool = createTool({
  id: 'my-tool' as const,
  description: 'Brief description (helps agents choose this tool)',

  inputSchema: z.object({
    requiredParam: z.string().describe('What this param does'),
    optionalParam: z.number().optional().describe('Optional parameter'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    error: z.string().optional(),
  }),

  execute: async ({ context }) => {
    const { requiredParam, optionalParam } = context;

    try {
      const coreServices = getCoreServices();
      const result = await coreServices.myService.doSomething(
        requiredParam,
        optionalParam
      );

      return {
        success: true,
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to execute my-tool: ${errorMessage}`);
    }
  },
});
```

### Testing Tools

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { myTool } from './my-tool.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('myTool', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  it('should have correct metadata', () => {
    expect(myTool.id).toBe('my-tool');
    expect(myTool.inputSchema).toBeDefined();
    expect(myTool.outputSchema).toBeDefined();
  });

  it('should execute successfully with valid input', async () => {
    const result = await myTool.execute({
      context: {
        requiredParam: 'test',
        optionalParam: 42,
      }
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it('should throw error with invalid input', async () => {
    await expect(myTool.execute({
      context: {
        requiredParam: '',  // Invalid
      }
    })).rejects.toThrow();
  });
});
```

---

## Common Patterns

### Tool Chaining

Agents can chain tools for complex operations:

```typescript
// Agent uses multiple tools in sequence
const agent = new Agent({
  name: 'Example Agent',
  tools: {
    [searchFunctionsTool.id]: searchFunctionsTool,
    [getFunctionMetadataTool.id]: getFunctionMetadataTool,
    [executeFunctionTool.id]: executeFunctionTool,
  },
});

// Agent workflow:
// 1. Search for function
// 2. Get metadata to verify inputs
// 3. Execute with parameters
```

### Service Composition

Services can call each other:

```typescript
// In FunctionsService
async searchFunctions(query: string, limit: number) {
  // Use LLM service to generate embedding
  const embedding = await this.llmService.getEmbedding(query);

  // Use Vector service to search
  const results = await this.vectorService.search(embedding, limit);

  return results;
}
```

### Lazy Loading

Tools load services lazily via `getCoreServices()`:

```typescript
// Tool doesn't hold service reference
export const myTool = createTool({
  execute: async ({ context }) => {
    // Get service on-demand
    const coreServices = getCoreServices();
    return await coreServices.myService.doSomething();
  },
});
```

---

## Future Enhancements

### Planned Tools

1. **Web Tools** - Web scraping, crawling, screenshot
2. **Research Tools** - Documentation search, web search
3. **Memory Tools** - Store/retrieve conversation context
4. **Deploy Tools** - Function deployment and monitoring

### Planned Services

1. **Cache Service** - Redis caching layer
2. **Queue Service** - Background job processing
3. **Telemetry Service** - Real-time monitoring
4. **Auth Service** - API key management

---

## Troubleshooting

### Common Issues

**Issue:** "Core services not initialized"
```
Error: Core services not initialized
```

**Fix:** Call `initializeCoreServices()` in `index.ts`:
```typescript
await initializeCoreServices();
```

**Issue:** Tool returns undefined
```
const result = await myTool.execute({ context: {} });
// result is undefined
```

**Fix:** Service might not be initialized. Check `getCoreServices()` is called.

**Issue:** Tests pollute production .env
```
Tests modify production environment variables
```

**Fix:** Ensure `NODE_ENV=test` is set in `vitest.globalSetup.ts`:
```typescript
export function setup() {
  process.env.NODE_ENV = 'test';
}
```

---

## References

- [Mastra Tools Documentation](https://mastra.ai/docs/tools)
- [Zod Documentation](https://zod.dev)
- [Qdrant Documentation](https://qdrant.tech/documentation)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
