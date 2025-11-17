# Vargos Core

NestJS API server for Vargos - managing functions, executing system actions, and exposing OpenAPI & MCP endpoints.

## Quick Start

```bash
pnpm install
pnpm dev  # Server at http://localhost:4861
```

## Architecture

- **Controller**: HTTP endpoints + Swagger only. No business logic.
- **Service**: Business logic, logging, error handling. Wraps `@vargos/core-lib`.
- **Tool**: MCP tools that map 1:1 to controller methods.
- **Module**: Dependency injection configuration.

## Modules

### Functions
Dynamic, AI-managed function execution. Functions are loaded from a local directory, indexed for search, and executed with dynamic parameters.

**Endpoints:**
- `GET /functions/reindex` - Reindex all functions
- `GET /functions/search?query=KEYWORD&limit=10` - Search functions
- `POST /functions/execute` - Execute function with `{ functionId, params }`

**Features:**
- Metadata-driven (`.meta.json` per function)
- Auto-cloned from [vargos-functions-template](https://github.com/chozzz/vargos-functions-template)
- Supports TypeScript/Node.js & Python

### Env
Central source of truth for environment variables. Powers shell executions and function executions with automatic injection.

**Endpoints:**
- `GET /env?search=KEYWORD` - Search/list variables (sensitive values censored)
- `GET /env/:key` - Get specific variable
- `POST /env` - Set/update variable `{ key, value }`

**Features:**
- Local `.env` file provider (extensible to cloud secret managers)
- Instant updates, no restart needed
- Secure by default

### Shell
Persistent, programmatic shell access for automation and agent-driven workflows.

**Endpoints:**
- `POST /shell/execute` - Execute command `{ command }`
- `GET /shell/history` - Get command history
- `POST /shell/interrupt` - Interrupt running command

**Features:**
- Single persistent Bash shell session
- Command history for auditing
- One command at a time (interrupt support)

### LLM
Large Language Model service wrapper around `@vargos/core-lib`. Provides embeddings and chat completions.

**Features:**
- OpenAI provider (extensible)
- Embeddings generation (single or batch)
- Chat completions

### Vector
Vector database service wrapper around `@vargos/core-lib`. Provides semantic search and indexing.

**Features:**
- Qdrant provider (extensible)
- Collection management
- Semantic search with embeddings
- Index and delete operations

## API Documentation

- **Swagger UI**: `/api/swagger`
- **OpenAPI JSON**: `/api/json`
- **MCP**: Integrated via `@rekog/mcp-nest`

### Testing MCP

Use the MCP Inspector to test MCP tools:

```bash
npx @modelcontextprotocol/inspector
```

Connect to: `http://localhost:4861/mcp` (Streamable HTTP)

The inspector allows you to list all available tools and test them interactively.

## Configuration

### Environment Variables

```bash
# Core
CORE_PORT=4861
DATA_DIR=~/.vargos/data
FUNCTIONS_DIR=~/.vargos/functions

# LLM
OPENAI_API_KEY=your_key

# Vector DB
QDRANT_URL=https://your-instance.qdrant.io
QDRANT_API_KEY=your_key
```

### Local Directories

```
~/.vargos/
├── data/           # Application data storage
└── functions/      # Function templates (auto-managed)
```

## Development

### Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Development mode with watch |
| `pnpm build` | Production build |
| `pnpm start:prod` | Production server |
| `pnpm test` | Run tests |
| `pnpm type-check` | TypeScript validation |
| `pnpm lint` | ESLint check |

### Prebuild

The `scripts/prebuild.ts` handles:
- Directory creation and permissions
- Function template setup from GitHub
- Environment configuration

## Implementation Guidelines

See [`.cursor/rules/rules.mdc`](./src/.cursor/rules/rules.mdc) for detailed module implementation rules.

**Key Principles:**
- Controllers: No business logic, no logging, no try-catch
- Services: Wrap `@vargos/core-lib`, handle logging/errors
- Tools: 1:1 mapping to controller methods, MCP format
- DTOs: Use `nestjs-zod` with schemas from `@vargos/core-lib`

## License

See [LICENSE.md](../../LICENSE.md). Copyright (c) 2024 Vadi Taslim.
