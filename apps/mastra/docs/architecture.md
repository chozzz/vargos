# Vargos Architecture

## Overview

Vargos is a next-generation orchestration platform that bridges Large Language Models (LLMs) with real-world system execution. It enables AI agents to interact with systems through standardized interfaces (OpenAPI and Model Context Protocol).

**Core Philosophy:** Providing Agents to your Machine - focusing on giving AI agents practical capabilities to execute system actions.

## Architecture Layers

Vargos is organized into 4 distinct architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                             │
│  9 Specialized Agents (Router, Planner, Curator, etc.)      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Layer                            │
│  Orchestration (Search, Creation, Testing)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Tool Layer                              │
│  MCP Tools (1:1 passthrough to Core Services)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Core Services Layer                        │
│  LLM, Vector, Functions, Env, Shell Services                │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Agent Layer

**Location:** `apps/mastra/src/mastra/agents/`

Nine specialized agents organized into three phases:

#### Phase 1: Foundation Agents
- **Router Agent** - Analyzes requests and routes to appropriate agent/workflow
- **Planner Agent** - Breaks down goals into actionable task sequences
- **Curator Agent** - Searches and recommends existing functions (RAG-first)
- **Permission Agent** - Handles user approval and authorization

#### Phase 2: Creation Pipeline Agents
- **Function Creator Agent** - Generates new functions from specifications
- **Sandbox Agent** - Executes tests safely and provides diagnostics

#### Phase 3: Research & Memory Agents
- **Research Agent** - Gathers information from various sources
- **Memory Agent** - Manages hybrid global + thread memory

**Legacy:**
- **Vargos Agent** - Original monolithic agent (to be refactored)

#### Key Characteristics:
- All agents use OpenAI GPT-4o model for reasoning
- Structured output via Zod schemas ensures type safety
- PostgreSQL-based memory (pgMemory) for conversation context
- Each agent has focused, single-purpose responsibilities
- Agents delegate to other agents (lazy loading to avoid circular deps)

### Layer 2: Workflow Layer

**Location:** `apps/mastra/src/mastra/workflows/`

Three main workflows orchestrate multi-agent interactions:

#### 1. Function Search Workflow
**File:** `function-search.workflow.ts`

**Purpose:** Semantic search of function repository

**Steps:**
1. **searchFunctions** - Initial semantic search via vector DB
2. **rankResults** - Score and prioritize matches
3. **selectBest** - Choose optimal function(s)

**Output:** Ranked list of relevant functions with metadata

#### 2. Function Creation Workflow (Simple)
**File:** `function-creation-simple.workflow.ts`

**Purpose:** End-to-end function generation and validation

**Agent Flow:**
```
Router → Planner → Curator → Permission → Creator → Sandbox
```

**Steps:**
1. **analyzeRequest** - Router parses user intent
2. **createPlan** - Planner generates implementation steps
3. **checkExisting** - Curator searches for alternatives (RAG-first)
4. **getApproval** - Permission agent requests user consent
5. **generateCode** - Creator writes function code
6. **runTests** - Sandbox validates and provides diagnostics

**Output:** Complete function with tests or actionable error diagnostics

#### 3. Function Testing Workflow
**File:** `function-testing.workflow.ts`

**Purpose:** Isolated test execution and analysis

**Steps:**
1. **executeTests** - Run vitest in sandbox
2. **parseResults** - Extract test outcomes
3. **diagnoseFailures** - Categorize issues (syntax, runtime, env, deps)
4. **suggestFixes** - Provide actionable recommendations

**Output:** TestAnalysis with structured diagnostics

### Layer 3: Tool Layer

**Location:** `apps/mastra/src/mastra/tools/`

Tools organized by domain, following 1:1 passthrough pattern:

#### Functions Domain
- **list-functions.tool.ts** - Get all available functions
- **get-function-metadata.tool.ts** - Retrieve function details
- **execute-function.tool.ts** - Run specific function

#### Environment Domain
- **get-env.tool.ts** - Read environment variables
- **set-env.tool.ts** - Write environment variables
- **search-env.tool.ts** - Query environment variables

#### Shell Domain
- **bash.tool.ts** - Execute persistent shell commands
- **bash-history.tool.ts** - View command history
- **bash-interrupt.tool.ts** - Stop running commands

#### Memory Domain
- **search-memory.tool.ts** - Query conversation history

#### Orchestration Domain
- **delegate-to-curator.tool.ts** - Hand off to Curator agent
- **delegate-to-creator.tool.ts** - Hand off to Creator agent
- **delegate-to-sandbox.tool.ts** - Hand off to Sandbox agent

#### Tool Design Pattern:
```typescript
// 1:1 passthrough to core service
export const getEnvTool = createTool({
  id: 'get-env',
  description: 'Get environment variable value',
  inputSchema: z.object({
    key: z.string().describe('Environment variable name'),
  }),
  outputSchema: z.object({
    key: z.string(),
    value: z.string(),
    exists: z.boolean(),
  }),
  execute: async ({ context }) => {
    const { key } = context;
    const envService = await getEnvService();
    const result = await envService.getEnv(key);

    return {
      key: result.key,
      value: result.value,
      exists: result.exists,
    };
  },
});
```

**Key Principles:**
- Tools are thin wrappers around core services
- No business logic in tools (lives in services)
- Structured input/output schemas for type safety
- Tools expose core capabilities to agents via MCP

### Layer 4: Core Services Layer

**Location:** `packages/core-lib/src/`

Five singleton services providing system capabilities:

#### 1. LLM Service
**File:** `llm/llm.service.ts`

**Responsibilities:**
- OpenAI API integration
- Generate embeddings for semantic search
- Chat completions (future)

**Key Methods:**
- `generateEmbeddings(texts: string[]): Promise<number[][]>`

#### 2. Vector Service
**File:** `vector/vector.service.ts`

**Responsibilities:**
- Qdrant vector database integration
- Store and search embeddings
- Semantic similarity matching

**Key Methods:**
- `search(query: string, limit: number): Promise<SearchResult[]>`
- `upsert(points: VectorPoint[]): Promise<void>`

#### 3. Functions Service
**File:** `functions/functions.service.ts`

**Responsibilities:**
- Function repository management
- Execute functions via subprocess
- Handle function metadata
- Support versioning (v1, v2, etc.)

**Key Methods:**
- `listFunctions(): Promise<FunctionMetadata[]>`
- `getFunctionMetadata(functionId: string): Promise<FunctionMetadata>`
- `executeFunction(functionId: string, input: unknown): Promise<ExecutionResult>`

**Function Repository Structure:**
```
~/.vargos/functions/src/
├── category/
│   └── function-name/
│       ├── v1/
│       │   ├── index.ts              # Main implementation
│       │   ├── function-name.meta.json  # Metadata
│       │   └── function-name.test.ts    # Vitest tests
│       └── v2/                       # Version 2 (if exists)
```

#### 4. Env Service
**File:** `env/env.service.ts`

**Responsibilities:**
- Environment variable management
- .env file operations
- Test isolation (.env.test support)

**Key Methods:**
- `getEnv(key: string): Promise<EnvVariable>`
- `setEnv(key: string, value: string): Promise<void>`
- `searchEnv(query: string): Promise<EnvVariable[]>`

**Providers:**
- **FilepathEnvProvider** - .env file operations with test mode
- **MemoryEnvProvider** - In-memory (testing only)

#### 5. Shell Service
**File:** `shell/shell.service.ts`

**Responsibilities:**
- Persistent shell sessions
- Command execution and history
- Process management

**Key Methods:**
- `executeCommand(command: string, sessionId?: string): Promise<CommandResult>`
- `getHistory(sessionId: string): Promise<string[]>`
- `interruptCommand(sessionId: string): Promise<void>`

### Service Initialization Pattern

All core services use singleton pattern with lazy initialization:

```typescript
// apps/mastra/src/mastra/services/core.service.ts

let coreServicesInitialized = false;

export async function initializeCoreServices(): Promise<void> {
  if (coreServicesInitialized) {
    return; // Already initialized
  }

  // Initialize all services
  await getLLMService();
  await getVectorService();
  await getFunctionsService();
  await getEnvService();
  await getShellService();

  coreServicesInitialized = true;
  console.log('✅ [Core] All services initialized');
}
```

**Benefits:**
- Services initialized once, reused everywhere
- Lazy loading reduces startup time
- Test mode automatically isolated
- No circular dependency issues

## Memory System

Vargos uses a hybrid memory architecture with two scopes:

### PostgreSQL Memory (Thread Scope)
**Implementation:** `apps/mastra/src/mastra/memory/pg-memory.ts`

```typescript
export const pgMemory = new Memory({
  provider: new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  }),
});
```

**Characteristics:**
- Conversation-specific context
- Thread-based isolation
- Recent decisions and working memory
- Mastra's built-in PostgresStore

**Usage:**
```typescript
const agent = new Agent({
  name: 'Router Agent',
  memory: pgMemory,
  // ...
});
```

### Qdrant Vector Memory (Global Scope)
**Implementation:** Core Vector Service + Qdrant

**Characteristics:**
- Global knowledge across all conversations
- Semantic search for functions
- Persistent embeddings
- Cross-conversation patterns

**Usage:**
```typescript
// Function search uses vector similarity
const results = await vectorService.search(query, limit);
```

### Memory Scopes

| Scope    | Storage      | Lifetime         | Use Cases                          |
|----------|--------------|------------------|------------------------------------|
| Thread   | PostgreSQL   | Per-conversation | Context, decisions, recent actions |
| Global   | Qdrant       | Persistent       | Function search, learned patterns  |

## RAG-First Philosophy

Vargos implements a "RAG-First" approach: **always search before creating**.

### Implementation Flow

```
User Request
     ↓
Router Agent (analyzes intent)
     ↓
Planner Agent (creates task plan)
     ↓
Curator Agent (searches existing functions) ← RAG CHECKPOINT
     ↓
   Found? ──YES→ Return existing function
     │
    NO
     ↓
Permission Agent (request user approval)
     ↓
Function Creator Agent (generate new function)
     ↓
Sandbox Agent (test and validate)
```

### Curator Agent Pattern

**File:** `apps/mastra/src/mastra/agents/curator-agent.ts`

```typescript
// Structured output ensures consistent decision
const CuratorDecisionSchema = z.object({
  recommendation: z.enum(['use_existing', 'create_new', 'needs_clarification']),
  existingFunctions: z.array(/* function matches */),
  reasoning: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});
```

**Benefits:**
- Reduces duplicate function creation
- Promotes reusability
- Faster responses (no generation needed)
- Maintains function repository quality

## Agent Interaction Model

### Sequential Delegation Pattern

Agents delegate to specialized agents using lazy imports to avoid circular dependencies:

```typescript
// In Router Agent
export async function delegateToCurator(request: string) {
  // Lazy import prevents circular dependency
  const { curatorAgent } = await import('./curator-agent');

  return await curatorAgent.generate(request, {
    // context
  });
}
```

### Typical Request Flow

```
1. User Request
   ↓
2. Router Agent (route to workflow or agent)
   ↓
3. Planner Agent (break down into tasks)
   ↓
4. Curator Agent (search existing solutions)
   ↓
5. Permission Agent (get user approval)
   ↓
6. Function Creator Agent (generate code)
   ↓
7. Sandbox Agent (test and diagnose)
   ↓
8. Response to User (with structured output)
```

### Structured Output Pattern

All agents use OpenAI structured output with Zod schemas:

```typescript
const agent = new Agent({
  name: 'Sandbox Agent',
  model: 'openai/gpt-4o',

  // Define expected output structure
  structuredOutput: {
    schema: TestAnalysisSchema,
  },

  // Agent will ALWAYS return this shape
  // No parsing needed - type-safe output
});
```

**Benefits:**
- Type safety end-to-end
- No JSON parsing errors
- Predictable agent responses
- Easy composition of multi-agent workflows

## Testing Strategy

### Test Organization

```
apps/mastra/
├── src/
│   └── mastra/
│       ├── agents/
│       │   └── *.agent.test.ts        # Agent unit tests
│       ├── tools/
│       │   ├── env/
│       │   │   └── env-tools.integration.test.ts  # Unified env tests
│       │   ├── functions/
│       │   │   └── *.tool.test.ts     # Function tool tests
│       │   └── shell/
│       │       └── *.tool.test.ts     # Shell tool tests
│       └── workflows/
│           └── *.workflow.test.ts     # Workflow integration tests
├── vitest.config.ts                   # Vitest configuration
├── vitest.globalSetup.ts              # Global test setup
└── vitest.setup.ts                    # Per-test-file setup
```

### Test Isolation Architecture

**Goal:** Tests must never pollute production `.env` file

**Solution:** Multi-layered isolation using `.env.test`

#### Layer 1: Global Setup
**File:** `vitest.globalSetup.ts`

```typescript
export function setup() {
  // Set NODE_ENV=test BEFORE any module imports
  // This causes FilepathEnvProvider to use .env.test
  process.env.NODE_ENV = 'test';
}
```

#### Layer 2: Provider Logic
**File:** `packages/core-lib/src/env/providers/filepath.provider.ts`

```typescript
constructor(config: FilepathEnvProviderConfig = {}) {
  const isTestMode = process.env.NODE_ENV === 'test';
  const defaultEnvFile = isTestMode ? '.env.test' : '.env';

  this.envFilePath = config.envFilePath ||
    path.resolve(process.cwd(), defaultEnvFile);
}
```

#### Layer 3: Test Setup
**File:** `vitest.setup.ts`

```typescript
import { config as dotenvConfig } from 'dotenv';

beforeAll(() => {
  // Load .env.test for test database URLs, etc.
  dotenvConfig({ path: path.resolve(process.cwd(), '.env.test') });

  // Set test-specific paths
  process.env.DATA_DIR = path.join(os.tmpdir(), 'vargos-test-data');
  process.env.FUNCTIONS_DIR = path.join(os.tmpdir(), 'vargos-test-functions');
});
```

#### Layer 4: Sequential Execution
**File:** `tools/env/env-tools.integration.test.ts`

```typescript
// All 25 env tests in ONE file to prevent parallel execution race conditions
describe('Environment Tools - Integration Tests', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  describe('getEnvTool', () => { /* 6 tests */ });
  describe('setEnvTool', () => { /* 9 tests */ });
  describe('searchEnvTool', () => { /* 10 tests */ });
});
```

**Result:**
- Production `.env` stays clean (21 lines)
- Test `.env.test` contains test data (Database URL: vargos_mastra_test)
- All 25 env tests pass consistently
- No race conditions or file conflicts

### Test Coverage

| Type          | Location                  | Purpose                          |
|---------------|---------------------------|----------------------------------|
| Unit          | `*.agent.test.ts`         | Individual agent behavior        |
| Integration   | `*.tool.test.ts`          | Tool + core service interaction  |
| Workflow      | `*.workflow.test.ts`      | Multi-agent orchestration        |
| Environment   | `env-tools.integration.ts`| Isolated env operations          |

## Configuration

### Environment Variables

#### Core App (apps/core)
```bash
CORE_PORT=4861                  # API port (dev uses 8180)
DATA_DIR=~/.vargos/data         # Base directory for data
FUNCTIONS_DIR=~/.vargos/functions/src  # Function repository
OPENAI_API_KEY=sk-...           # Required for LLM operations
QDRANT_URL=http://localhost:6333  # Vector database
QDRANT_API_KEY=                 # Qdrant authentication
```

#### Mastra App (apps/mastra)
```bash
MASTRA_PORT=4862                           # Mastra API port
OPENAI_API_KEY=sk-...                      # Required for agents
CORE_MCP_CLIENT_URL=http://localhost:4861/mcp  # Core MCP endpoint
DATABASE_URL=postgresql://...              # PostgreSQL for memory
```

#### Test Environment (.env.test)
```bash
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/vargos_mastra_test
DATA_DIR=/tmp/vargos-test-data
FUNCTIONS_DIR=/tmp/vargos-test-functions
```

### Development Workflow

#### 1. Start Core Services
```bash
cd apps/core
pnpm dev  # Starts on port 8180 with watch mode
```

#### 2. Start Mastra
```bash
cd apps/mastra
mastra dev  # Starts on port 4862
```

#### 3. Run Tests
```bash
# All tests
pnpm test

# Specific test file
pnpm test env-tools.integration

# Watch mode
pnpm test:watch
```

#### 4. Build Everything
```bash
# From root
pnpm build

# Individual packages
pnpm --filter @workspace/core-lib build
pnpm --filter @vargos/core build
pnpm --filter vargos-mastra build
```

## MCP Integration

### Core MCP Server
**Location:** `apps/core` (NestJS)
**Endpoint:** `http://localhost:4861/mcp`

**Exposed via:** `@rekog/mcp-nest` package

**Tools Available:**
- All function operations (list, get, execute)
- Environment management (get, set, search)
- Shell operations (bash, history, interrupt)

### Mastra MCP Client
**Location:** `apps/mastra/src/mastra/mcp/vargos-mcp-client.ts`

**Purpose:** Connect Mastra agents to Core services via MCP

```typescript
import { createMcpClient } from '@mastra/mcp';

export const vargosMcpClient = createMcpClient({
  name: 'vargos-core',
  url: process.env.CORE_MCP_CLIENT_URL || 'http://localhost:4861/mcp',
  transport: 'http',
});
```

### Mastra MCP Server
**Location:** `apps/mastra/src/mastra/mcp/vargos-mcp-server.ts`

**Purpose:** Expose Mastra agents to external MCP clients

**Agents Exposed:**
- vargosAgent (legacy)
- routerAgent
- curatorAgent
- functionCreatorAgent
- sandboxAgent

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   External Clients                       │
│              (Claude Code, AIChat, etc.)                 │
└─────────────────────────────────────────────────────────┘
                         ↓ MCP Protocol
┌─────────────────────────────────────────────────────────┐
│                  Mastra App (Port 4862)                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │  MCP Server (exposes agents)                       │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  9 Specialized Agents                              │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  3 Workflows                                        │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  MCP Client (connects to Core)                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         ↓ MCP Protocol
┌─────────────────────────────────────────────────────────┐
│                  Core App (Port 4861)                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │  MCP Server (exposes tools)                        │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  5 Core Services (LLM, Vector, Functions, etc.)   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
│   PostgreSQL     │  │     Qdrant       │  │   Functions  │
│   (Memory)       │  │  (Vector Store)  │  │  Repository  │
└──────────────────┘  └──────────────────┘  └──────────────┘
```

## Future Roadmap (Phase 4)

### Planned Agents
1. **Crawler Agent** - Web scraping and data extraction
2. **Dev Assistant Agent** - Code review and suggestions
3. **Evaluator Agent** - Function quality assessment
4. **Infrastructure Agent** - Deployment and monitoring

### Planned Features
- Multi-language function support (Python, Rust)
- Distributed function execution
- Advanced permission scoping (allow_session)
- Function marketplace and sharing
- Real-time agent telemetry

## Conclusion

Vargos provides a robust, layered architecture for AI-driven system automation:

- **Agent Layer** - Intelligent decision-making with structured outputs
- **Workflow Layer** - Orchestrated multi-agent processes
- **Tool Layer** - Standardized MCP interface to capabilities
- **Service Layer** - Reliable system integration

The RAG-first philosophy, comprehensive testing strategy, and clean separation of concerns make Vargos a production-ready platform for building AI agents that safely interact with real-world systems.
