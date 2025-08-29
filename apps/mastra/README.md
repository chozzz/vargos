# Vargos Mastra - Multi-Agent Orchestration System

The **Mastra** app is Vargos's multi-agent orchestration layer, implementing 9 specialized AI agents that work together to execute complex tasks.

## Overview

Mastra provides a structured agent-based architecture for:
- **Function discovery** via semantic search (RAG-first)
- **Function generation** with tests and metadata
- **Task planning** and decomposition
- **User permission** management
- **Safe execution** and testing
- **Research** and information gathering
- **Memory management** (global + thread)

## Architecture

```
┌─────────────────────────────────────────────┐
│          Agent Layer (9 Agents)              │
│  Router, Planner, Curator, Permission,      │
│  Creator, Sandbox, Research, Memory          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│       Workflow Layer (Orchestration)         │
│  Function Search, Creation, Testing          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Tool Layer (MCP Tools)              │
│  Functions, Env, Shell, Memory Tools         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      Core Services (@workspace/core-lib)     │
│  LLM, Vector, Functions, Env, Shell          │
└─────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL (for memory)
- Qdrant (optional, for vector search)
- OpenAI API key

### Installation

1. **Install dependencies:**
   ```bash
   cd apps/mastra
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Required environment variables:**
   ```bash
   # Mastra configuration
   MASTRA_PORT=4862

   # OpenAI for agents and embeddings
   OPENAI_API_KEY=sk-...

   # PostgreSQL for conversation memory
   DATABASE_URL=postgresql://localhost:5432/vargos_mastra

   # Core MCP client connection
   CORE_MCP_CLIENT_URL=http://localhost:4861/mcp

   # Function repository location
   FUNCTIONS_DIR=~/.vargos/functions/src

   # Data directory
   DATA_DIR=~/.vargos/data
   ```

4. **Start development server:**
   ```bash
   mastra dev
   ```

   Server will be available at `http://localhost:4862`

## Phase 1-3 Agents

### Phase 1: Foundation Agents

#### Router Agent
**File:** `src/mastra/agents/router-agent.ts`
**Model:** `openai/gpt-4o-mini` (fast, cheap)

Entry point for all requests. Analyzes user intent and routes to appropriate agent.

**Responsibilities:**
- Analyze user intent
- Determine task complexity
- Identify requirements (permissions, search, research)
- Route to appropriate agent

**Output:** Routing decision with next agent

#### Planner Agent
**File:** `src/mastra/agents/planner-agent.ts`
**Model:** `openai/gpt-4o`

Decomposes complex tasks into actionable execution steps.

**Responsibilities:**
- Analyze task complexity
- Break down into sequential steps
- Identify dependencies
- Assign agents to steps
- Estimate duration and risks

**Output:** Execution plan with steps

#### Curator Agent
**File:** `src/mastra/agents/curator-agent.ts`
**Model:** `openai/gpt-4o`

Searches function repository and recommends reuse, extension, or creation.

**Responsibilities:**
- Semantic search of functions
- Analyze match quality
- Recommend reuse/extend/create
- Prevent duplicate functions
- Handle versioning (v1, v2, v3)

**Tools:**
- `search-functions` - Semantic search via vector DB
- `list-functions` - List all functions
- `get-function-metadata` - Get function details

**Output:** Curator decision with recommendations

#### Permission Agent
**File:** `src/mastra/agents/permission-agent.ts`
**Model:** `openai/gpt-4o`

Handles user approval flows and explains proposed actions.

**Responsibilities:**
- Present actions clearly
- Get explicit user approval
- Track permission scope (once, session)
- Explain risks and alternatives

**Output:** Permission request with user-friendly prompt

### Phase 2: Creation Pipeline Agents

#### Function Creator Agent
**File:** `src/mastra/agents/function-creator-agent.ts`
**Model:** `openai/gpt-4o`

Generates production-quality TypeScript functions with tests.

**Responsibilities:**
- Generate clean TypeScript code
- Create comprehensive metadata
- Write tests with good coverage
- Follow best practices

**Tools:**
- `create-function` - Save function to repository

**Output:** Complete function with code, tests, metadata

#### Sandbox Agent
**File:** `src/mastra/agents/sandbox-agent.ts`
**Model:** `openai/gpt-4o`

Executes function tests safely and provides diagnostics.

**Responsibilities:**
- Run tests in isolated environment
- Parse test output
- Categorize issues (syntax, runtime, env, deps)
- Determine if retry is worthwhile
- Provide actionable fix suggestions

**Tools:**
- `test-function` - Run vitest tests

**Output:** Test analysis with diagnostics

### Phase 3: Research & Memory Agents

#### Research Agent
**File:** `src/mastra/agents/research-agent.ts`
**Model:** `openai/gpt-4o`

Gathers information from various sources with verification.

**Responsibilities:**
- Search for current information
- Evaluate source credibility
- Cross-reference across sources
- Rate confidence in findings

**Output:** Research results with sources and confidence

#### Memory Agent
**File:** `src/mastra/agents/memory-agent.ts`
**Model:** `openai/gpt-4o`

Manages hybrid global + thread memory for conversation context.

**Responsibilities:**
- Store important facts, decisions, context
- Retrieve relevant memories
- Search memories by topic
- Provide insights from patterns

**Memory Scopes:**
- **Global** - Persistent across all conversations (Qdrant)
- **Thread** - Conversation-specific (PostgreSQL)

**Output:** Memory operation results with insights

## Workflows

### Function Search Workflow
**File:** `src/mastra/workflows/function-search.workflow.ts`

Orchestrates semantic function search.

**Steps:**
1. **searchFunctions** - Vector similarity search
2. **rankResults** - Score and prioritize matches
3. **selectBest** - Choose optimal function(s)

### Function Creation Workflow
**File:** `src/mastra/workflows/function-creation-simple.workflow.ts`

End-to-end function generation with validation.

**Agent Flow:**
```
Router → Planner → Curator → Permission → Creator → Sandbox
```

**Steps:**
1. **analyzeRequest** - Router parses intent
2. **createPlan** - Planner generates steps
3. **checkExisting** - Curator searches (RAG-first)
4. **getApproval** - Permission agent requests consent
5. **generateCode** - Creator writes function
6. **runTests** - Sandbox validates and diagnoses

### Function Testing Workflow
**File:** `src/mastra/workflows/function-testing.workflow.ts`

Isolated test execution and analysis.

**Steps:**
1. **executeTests** - Run vitest
2. **parseResults** - Extract outcomes
3. **diagnoseFailures** - Categorize issues
4. **suggestFixes** - Provide recommendations

## Tools

Tools are organized by domain:

### Functions Domain
- `list-functions` - Get all functions
- `search-functions` - Semantic search
- `get-function-metadata` - Function details
- `execute-function` - Run function
- `create-function` - Create new function
- `test-function` - Run tests

### Environment Domain
- `get-env` - Read environment variable
- `set-env` - Write environment variable
- `search-env` - Query environment variables

### Shell Domain
- `bash` - Execute shell commands
- `bash-history` - View command history
- `bash-interrupt` - Stop running command

### Memory Domain
- `search-memory` - Query conversation history

### Orchestration Domain
- `delegate-to-curator` - Hand off to Curator
- `delegate-to-creator` - Hand off to Creator
- `delegate-to-sandbox` - Hand off to Sandbox

## Core Services Integration

Mastra tools use core services from `@workspace/core-lib`:

```typescript
import { getCoreServices } from './services/core.service';

const coreServices = getCoreServices();

// Available services:
coreServices.llmService       // OpenAI embeddings
coreServices.vectorService    // Qdrant semantic search
coreServices.functionsService // Function repository
coreServices.envService       // Environment variables
coreServices.shellService     // Persistent shell
```

**Service Initialization:**
```typescript
// Called once at startup in index.ts
await initializeCoreServices();
```

## Memory System

Vargos uses hybrid memory architecture:

### PostgreSQL Memory (Thread Scope)
```typescript
import { pgMemory } from './memory/pg-memory';

// Used by all agents for conversation context
const agent = new Agent({
  name: 'Router Agent',
  memory: pgMemory,
  // ...
});
```

**Characteristics:**
- Conversation-specific context
- Thread-based isolation
- Recent decisions and actions

### Qdrant Vector Memory (Global Scope)

**Characteristics:**
- Global knowledge across conversations
- Semantic search for functions
- Persistent embeddings

## Development

### Project Structure

```
src/mastra/
├── agents/                    # 9 specialized agents
│   ├── router-agent.ts
│   ├── planner-agent.ts
│   ├── curator-agent.ts
│   ├── permission-agent.ts
│   ├── function-creator-agent.ts
│   ├── sandbox-agent.ts
│   ├── research-agent.ts
│   ├── memory-agent.ts
│   └── vargos-agent.ts       # Legacy
│
├── tools/                     # MCP tools by domain
│   ├── functions/
│   ├── env/
│   ├── shell/
│   ├── memory/
│   └── orchestration/
│
├── workflows/                 # Multi-agent workflows
│   ├── function-search.workflow.ts
│   ├── function-creation-simple.workflow.ts
│   └── function-testing.workflow.ts
│
├── memory/                    # Memory configuration
│   └── pg-memory.ts
│
├── services/                  # Core service integration
│   └── core.service.ts
│
└── index.ts                   # Mastra initialization
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific test
pnpm test curator-agent

# Coverage
pnpm test:cov
```

**Test Isolation:**

Tests use `.env.test` to prevent pollution of production `.env`:

```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/vargos_mastra_test
DATA_DIR=/tmp/vargos-test-data
FUNCTIONS_DIR=/tmp/vargos-test-functions
```

**Test Files:**
- `*.test.ts` - Unit tests
- `*.integration.test.ts` - Integration tests

### Adding New Agents

1. **Create agent file:**
   ```typescript
   // src/mastra/agents/your-agent.ts
   import { Agent } from '@mastra/core/agent';
   import { z } from 'zod';
   import { pgMemory } from '../memory/pg-memory';

   const YourAgentOutputSchema = z.object({
     // Define output structure
   });

   async function createYourAgent() {
     return new Agent({
       name: 'Your Agent',
       description: 'What this agent does',
       instructions: `...`,
       model: 'openai/gpt-4o',
       memory: pgMemory,
       tools: {},
     });
   }

   export const yourAgent = await createYourAgent();
   ```

2. **Register in index.ts:**
   ```typescript
   import { yourAgent } from './agents/your-agent';

   export const mastra = new Mastra({
     agents: {
       yourAgent,
       // ...
     },
   });
   ```

3. **Add tests:**
   ```typescript
   // src/mastra/agents/your-agent.test.ts
   import { describe, it, expect } from 'vitest';
   import { yourAgent } from './your-agent';

   describe('YourAgent', () => {
     it('should have correct configuration', () => {
       expect(yourAgent.name).toBe('Your Agent');
     });
   });
   ```

### Adding New Tools

1. **Create tool file:**
   ```typescript
   // src/mastra/tools/domain/your-tool.tool.ts
   import { createTool } from '@mastra/core/tools';
   import { getCoreServices } from '../../services/core.service';
   import { z } from 'zod';

   export const yourTool = createTool({
     id: 'your-tool' as const,
     description: 'What this tool does',
     inputSchema: z.object({
       param: z.string(),
     }),
     outputSchema: z.object({
       success: z.boolean(),
       result: z.string(),
     }),
     execute: async ({ context }) => {
       const coreServices = getCoreServices();
       // Implementation
     },
   });
   ```

2. **Export from index:**
   ```typescript
   // src/mastra/tools/domain/index.ts
   export { yourTool } from './your-tool.tool';
   ```

3. **Use in agent:**
   ```typescript
   import { yourTool } from '../tools/domain';

   const agent = new Agent({
     tools: {
       [yourTool.id]: yourTool,
     },
   });
   ```

## Configuration

### Mastra Configuration

**File:** `src/mastra/index.ts`

```typescript
export const mastra = new Mastra({
  bundler: {
    transpilePackages: ["@workspace/core-lib"],
    sourcemap: true,
  },
  server: {
    port: parseInt(process.env.MASTRA_PORT ?? '4862'),
  },
  agents: {
    // Phase 1: Foundation
    routerAgent,
    plannerAgent,
    curatorAgent,
    permissionAgent,

    // Phase 2: Creation Pipeline
    functionCreatorAgent,
    sandboxAgent,

    // Phase 3: Research & Memory
    researchAgent,
    memoryAgent,
  },
  workflows: {
    functionSearchWorkflow,
    functionCreationWorkflow,
    functionTestingWorkflow,
  },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  }),
  logger,
});
```

## Common Issues

### Issue: Core services not initialized
```
Error: Core services not initialized
```

**Fix:** Ensure `initializeCoreServices()` is called in `index.ts`

### Issue: Cannot find package '@workspace/core-lib'
```
Error: Cannot find package '@workspace/core-lib'
```

**Fix:**
```bash
# Rebuild core-lib
pnpm --filter @workspace/core-lib build
```

### Issue: Tests pollute production .env
```
Tests modify production environment variables
```

**Fix:** Ensure `NODE_ENV=test` in `vitest.globalSetup.ts`

### Issue: pgMemory undefined
```
TypeError: Cannot read property 'pgMemory' of undefined
```

**Fix:** Use static imports instead of dynamic:
```typescript
// ✅ Good
import { pgMemory } from '../memory/pg-memory';

// ❌ Bad
const { pgMemory } = await import('../memory/pg-memory');
```

## Documentation

Comprehensive documentation available in `docs/`:

- **[Architecture](docs/architecture.md)** - Complete system architecture
- **[Contributing](docs/contributing.md)** - Developer guide
- **[Agents](docs/agents.md)** - All 9 agents with schemas
- **[Tools](docs/tools.md)** - Tools and services reference
- **[Functions](docs/functions.md)** - Function repository design

## API Endpoints

Mastra exposes HTTP endpoints:

- `/api/agents` - List available agents
- `/api/agents/:agentId` - Get agent details
- `/api/agents/:agentId/generate` - Execute agent
- `/api/workflows` - List workflows
- `/api/workflows/:workflowId/execute` - Execute workflow

## MCP Integration

### Mastra MCP Server

Exposes agents to external MCP clients:

**File:** `src/mastra/mcp/vargos-mcp-server.ts`

**Agents Exposed:**
- vargosAgent
- routerAgent
- curatorAgent
- functionCreatorAgent
- sandboxAgent

### Mastra MCP Client

Connects to Core's MCP endpoint:

**File:** `src/mastra/mcp/vargos-mcp-client.ts`

```typescript
export const vargosMcpClient = createMcpClient({
  name: 'vargos-core',
  url: process.env.CORE_MCP_CLIENT_URL || 'http://localhost:4861/mcp',
  transport: 'http',
});
```

## Roadmap

### Phase 4 (Planned)
- **Crawler Agent** - Web scraping and data extraction
- **Dev Assistant Agent** - Code review and suggestions
- **Evaluator Agent** - Function quality assessment
- **Infrastructure Agent** - Deployment and monitoring

### Future Enhancements
- Real-time agent telemetry
- Advanced permission scoping (session-level)
- Multi-language function support
- Distributed agent orchestration

## License

See [LICENSE.md](../../LICENSE.md) for full license terms.

Copyright (c) 2024 Vadi Taslim. All rights reserved.
