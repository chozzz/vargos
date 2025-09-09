# Vargos LangChain Agents

LangGraph-based agents with direct access to Vargos core-lib services (Functions, LLM, Vector, Env, Shell).

## Overview

This app provides AI agents built on **LangChain/LangGraph** that integrate with Vargos core services **without HTTP overhead**. All agents use `@workspace/core-lib` directly for maximum performance.

### Key Features

- ✅ **Direct Core-Lib Integration** - No HTTP calls, pure TypeScript service access
- ✅ **9 Vargos Tools** - Functions, shell, env, vector search available to all agents
- ✅ **LangSmith Observability** - Production-grade tracing and debugging
- ✅ **Type-Safe** - Full TypeScript inference from core-lib
- ✅ **Well-Tested** - Integration and unit tests for all tools

## Architecture

```
LangGraph Agent (react-agent, memory-agent, etc.)
    ↓ (uses VARGOS_CORE_TOOLS)
Vargos Core-Lib Tools (src/shared/tools/vargos-core-tools.ts)
    ↓ (direct import)
@workspace/core-lib Services
    ├── FunctionsService (list, search, execute)
    ├── LLMService (embeddings, chat)
    ├── VectorService (semantic search)
    ├── EnvService (environment variables)
    └── ShellService (command execution)
```

## Available Agents

| Agent | ID | Description | Default Model |
|-------|----|------------|---------------|
| **React Agent** | `agent` | ReAct pattern with tool calling (default) | `claude-sonnet-4-5-20250929` |
| **Memory Agent** | `memory_agent` | Conversation memory management | `claude-sonnet-4-5-20250929` |
| **Research Agent** | `research_agent` | Multi-step research with retrieval | `claude-sonnet-4-5-20250929` |
| **Retrieval Agent** | `retrieval_agent` | Document retrieval and Q&A | `claude-sonnet-4-5-20250929` |

> **Note:** See [MODELS.md](./MODELS.md) for full list of supported models and how to override defaults.

## Available Vargos Tools

All agents have access to these tools from `@workspace/core-lib`:

### Functions Tools
- `list_vargos_functions` - List all available functions
- `search_vargos_functions` - Semantic search for functions
- `get_function_metadata` - Get detailed function info
- `execute_vargos_function` - Execute a function by ID

### Shell Tool
- `vargos_shell` - Execute shell commands in persistent bash session

### Environment Tools
- `get_env_var` - Get environment variable value
- `search_env_vars` - Search environment variables
- `set_env_var` - Set environment variable (persisted to .env)

### Vector Tool
- `semantic_search` - Search vector database collections

## Getting Started

### Prerequisites

Ensure these environment variables are set in root `.env`:

```bash
# Required
OPENAI_API_KEY="sk-..."
QDRANT_URL="https://..."
QDRANT_API_KEY="..."
FUNCTIONS_DIR="/path/to/functions"

# Optional
DATA_DIR="~/.vargos/data"
ENV_FILE_PATH=".env"
QDRANT_PORT="443"

# LangSmith (optional but recommended)
LANGSMITH_API_KEY="lsv2_..."
LANGSMITH_TRACING_V2="true"
LANGSMITH_PROJECT="vargos-agents"
```

### Install Dependencies

```bash
cd /home/choz/dev/vargos
pnpm install
```

### Development

Start the LangGraph dev server:

```bash
cd apps/agents
pnpm dev
```

This runs on **port 2024** by default.

The server will:
1. Initialize Vargos core services (Functions, LLM, Vector, Env, Shell)
2. Start LangGraph API server
3. Make all agents available via HTTP API

### Build

```bash
pnpm build
```

Compiles TypeScript to `dist/` directory.

### Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Integration tests only
pnpm test -- src/shared/tests/vargos-core-integration.test.ts
```

## Usage

### Via apps/web Frontend

Connect to the agent via the Next.js frontend at `http://localhost:3000`:

```typescript
// apps/web automatically connects to http://localhost:2024
// Default assistant: "agent" (react-agent)
```

### Via LangGraph SDK

```typescript
import { Client } from "@langchain/langgraph-sdk";

const client = new Client({ apiUrl: "http://localhost:2024" });

const thread = await client.threads.create();

const response = await client.runs.stream(
  thread.thread_id,
  "agent", // assistantId
  {
    input: {
      messages: [{
        role: "user",
        content: "List all available Vargos functions"
      }]
    }
  }
);

for await (const chunk of response) {
  if (chunk.event === "messages/complete") {
    console.log(chunk.data.content);
  }
}
```

### Direct Graph Invocation (Testing)

```typescript
import { graph } from "./src/react-agent/graph.js";

const result = await graph.invoke({
  messages: [{
    role: "user",
    content: "Search for GitHub-related functions"
  }]
});

console.log(result.messages);
```

## Adding Custom Tools

### 1. Create a new tool in `src/shared/tools/`:

```typescript
// src/shared/tools/my-custom-tool.ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getVargosCoreServices } from "../services/vargos-core.js";

export const myCustomTool = new DynamicStructuredTool({
  name: "my_custom_tool",
  description: "Description of what this tool does",
  schema: z.object({
    param1: z.string().describe("Parameter description"),
  }),
  func: async ({ param1 }) => {
    const { functionsService } = getVargosCoreServices();
    // Your logic here
    return "result";
  },
});
```

### 2. Add to tools array:

```typescript
// src/react-agent/tools.ts
import { myCustomTool } from "../shared/tools/my-custom-tool.js";

export const TOOLS = [
  searchTavily,
  ...VARGOS_CORE_TOOLS,
  myCustomTool, // Add your tool
];
```

## Project Structure

```
apps/agents/
├── src/
│   ├── shared/
│   │   ├── services/
│   │   │   └── vargos-core.ts          # Core services initialization
│   │   ├── tools/
│   │   │   └── vargos-core-tools.ts    # Vargos tool definitions
│   │   └── tests/
│   │       ├── vargos-core-integration.test.ts  # Service tests
│   │       └── vargos-core-tools.test.ts        # Tool tests
│   ├── react-agent/
│   │   ├── graph.ts                    # React agent graph definition
│   │   ├── tools.ts                    # Agent tool imports
│   │   └── configuration.ts
│   ├── memory-agent/
│   ├── research-agent/
│   └── retrieval-agent/
├── package.json
└── tsconfig.json
```

## Troubleshooting

### Core services not initialized

**Error:** `Vargos Core Services not initialized`

**Solution:** Ensure `initializeVargosCoreServices()` is called at the top of your graph file:

```typescript
import { initializeVargosCoreServices } from "../shared/services/vargos-core.js";
await initializeVargosCoreServices();
```

### Missing environment variables

**Error:** `Missing required environment variables: OPENAI_API_KEY, QDRANT_API_KEY`

**Solution:** Check root `.env` file has all required variables set.

### Build errors with core-lib

**Error:** TypeScript compilation errors from `@workspace/core-lib`

**Solution:**
```bash
# Rebuild core-lib first
cd ../../packages/core-lib
pnpm build

# Then rebuild agents
cd ../../apps/agents
pnpm build
```

## Comparison: LangChain vs Mastra

| Aspect | LangChain (This App) | Mastra (apps/mastra) |
|--------|----------------------|----------------------|
| **Observability** | ✅ LangSmith (production-grade) | ⚠️ Pino logs only |
| **Testing** | ✅ 5+ test files | ❌ No tests |
| **Community** | ✅ Large (70k+ stars) | ⚠️ Small (early stage) |
| **Maturity** | ✅ Stable, well-documented | ⚠️ Breaking changes frequent |
| **Learning Curve** | ⚠️ Steeper (graph concepts) | ✅ Simpler (agent pattern) |
| **Visualization** | ✅ LangGraph Studio | ❌ None |

**Recommendation:** Use LangChain for production workloads requiring observability and stability.

## Contributing

When adding new agents or tools:

1. Create tests in `src/shared/tests/`
2. Update this README with new tool/agent documentation
3. Ensure TypeScript build passes (`pnpm build`)
4. Verify integration tests pass (`pnpm test`)

## License

Part of Vargos monorepo.
