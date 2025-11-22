# Vargos Mastra

Agent orchestration platform for Vargos using the [Mastra](https://mastra.ai) framework.

## What is This?

Mastra provides the **agent runtime** for Vargos - it hosts intelligent agents that can:
- Execute functions from core-lib (Jira, web search, text processing)
- Create new functions when missing functionality is detected (self-curative)
- Orchestrate multi-step workflows
- Coordinate multiple specialized agents

## Why Mastra?

**Problem:** Vargos Core provides functions via MCP, but we need intelligent orchestration, memory, and multi-step workflows.

**Solution:** Mastra gives us:
1. **Agent Framework** - Built-in LLM integration with tool calling
2. **Workflow Engine** - Multi-step processes with state management
3. **Memory System** - PostgreSQL-backed conversation history
4. **MCP Support** - Can expose agents via MCP for external clients

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Vargos Mastra                         │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Vargos Agent │  │ Workflows    │  │  Tools       │ │
│  │  (GPT-4o)     │  │ - Function   │  │  - List      │ │
│  │               │  │   Creation   │  │  - Search    │ │
│  └───────┬───────┘  └──────┬───────┘  │  - Execute   │ │
│          │                 │          │  - Create    │ │
│          └────────┬────────┘          └──────┬───────┘ │
│                   ▼                           ▼         │
│         Direct core-lib integration                     │
└─────────────────────────────────────────────────────────┘
                      ▼
         ┌─────────────────────────┐
         │   @vargos/core-lib      │
         │  - FunctionsService     │
         │  - EnvService           │
         │  - VectorService        │
         └─────────────────────────┘
```

## Key Concepts

### Self-Curative Loop

When a user requests something that doesn't exist:
1. **Detect** - Agent searches for relevant function
2. **Decide** - No match? Offer to create it
3. **Create** - Generate function scaffold via workflow
4. **Index** - Automatically indexed for semantic search
5. **Reuse** - Available immediately for future requests

**Why:** Extends capabilities automatically instead of requiring manual function development.

### Direct core-lib Integration

**Before:** Mastra → MCP Client → apps/core MCP → core-lib
**After:** Mastra → core-lib (direct)

**Why:**
- **Simpler** - No HTTP serialization overhead
- **Faster** - Direct function calls
- **Consistent** - Single source of truth for function management

### Tool Organization

Each tool in its own file (`*.tool.ts`) instead of grouped files.

**Why:**
- **Maintainability** - Easy to find and modify specific tools
- **Clarity** - One tool = one file = one responsibility
- **Testability** - Isolated unit testing

## Quick Start

### Run Mastra

```bash
cd apps/mastra
pnpm dev
```

**Port:** 4862
**MCP Endpoint:** http://localhost:4862/mcp

### Environment Variables

See `apps/mastra/.env`:
```bash
MASTRA_PORT=4862
OPENAI_API_KEY=sk-...           # Required for agents
FUNCTIONS_DIR=/path/to/functions # Required for core-lib
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...
DATABASE_URL=postgresql://...    # For conversation memory
```

### Talk to the Agent

Via Mastra API:
```bash
curl http://localhost:4862/api/agents/vargos/generate \
  -H "Content-Type: application/json" \
  -d '{"query": "Search for open Jira issues"}'
```

## What's Inside

### Agents (`src/mastra/agents/`)
- **vargos-agent.ts** - Main agent with function management tools

### Tools (`src/mastra/tools/`)
- **list-functions.tool.ts** - List all available functions
- **search-functions.tool.ts** - Semantic function search
- **execute-function.tool.ts** - Execute function by ID
- **get-function-metadata.tool.ts** - Get function details
- **create-function.tool.ts** - Create new function via workflow
- **invoke-agent.tool.ts** - Delegate to other agents
- **execute-workflow.tool.ts** - Run multi-step workflows
- **run-in-background.tool.ts** - Async task execution

### Workflows (`src/mastra/workflows/`)
- **create-function-workflow.ts** - 3-step function generation:
  1. Check if function exists
  2. Validate API keys
  3. Generate files and auto-index

### Services (`src/mastra/services/`)
- **functions.service.ts** - Singleton core-lib service initialization

## Next Steps

- **[Architecture](./architecture.md)** - Design decisions and patterns
- **[Development](./development.md)** - Add new tools/workflows
