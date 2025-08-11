# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# MUSTS
- Understand that every code written is a liability, therefore removing unused codes or reusing existing one is best practice.
- Make use of Context7 MCP if you're equipped with it and suggests 3rd party library that might do it easier.
- During committing, redact any Claude signature in it.

## Project Overview

Vargos is a next-generation orchestration platform that bridges Large Language Models (LLMs) with real-world system execution. It enables AI agents to interact with systems through standardized interfaces (OpenAPI and Model Context Protocol).

**Core Philosophy:** Providing Agents to your Machine - focusing on giving AI agents practical capabilities to execute system actions.

## Repository Structure

This is a **Turborepo monorepo** with pnpm workspaces:

```
vargos/
├── apps/
│   ├── core/           # NestJS API server (Port 8180 in dev, configurable via CORE_PORT)
│   ├── mastra/         # Mastra AI framework integration (Port 4862)
│   ├── cli/            # CLI agent (similar to Claude CLI or Copilot CLI)
│   └── chat/           # AIChat - All-in-one LLM CLI (Rust, git submodule)
├── packages/
│   ├── eslint-config/      # Shared ESLint configuration
│   ├── typescript-config/  # Shared TypeScript configuration
│   └── ui/                 # Shared UI components (shadcn)
```

**Node.js Requirement:** 20+

## Development Commands

### Root Level (Turborepo)
```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start all apps in development mode
pnpm build                # Build all apps
pnpm lint                 # Run linting across all packages
pnpm test                 # Run tests across all packages
pnpm format               # Format code with Prettier
```

### Core App (apps/core)
```bash
cd apps/core
pnpm dev                  # Start with watch mode (runs prebuild script, PORT=8180)
pnpm build                # Build NestJS app
pnpm start                # Start production server
pnpm start:debug          # Start with debugger
pnpm lint                 # Lint and fix
pnpm test                 # Run unit tests
pnpm test:watch           # Watch mode
pnpm test:cov             # With coverage
pnpm test:e2e             # End-to-end tests
```

### Mastra App (apps/mastra)
```bash
cd apps/mastra
mastra dev                # Start Mastra dev server
mastra build              # Build Mastra app
mastra start              # Start production server
```

### CLI App (apps/cli)
```bash
cd apps/cli
pnpm dev                  # Run in development mode (tsx watch)
pnpm build                # Build CLI
pnpm start                # Run built CLI
```

### Chat App (apps/chat)
```bash
cd apps/chat
pnpm dev -- [args]        # Run in dev mode (cargo run)
pnpm build                # Build Rust release binary
pnpm start -- [args]      # Run release binary
pnpm test                 # Run Rust tests
pnpm lint                 # Run Clippy linter
```

**Prerequisites:** Requires Rust/Cargo. See `apps/chat/SETUP.md` for installation instructions.

**Important:** Core has a `prebuild` script (`ts-node scripts/prebuild.ts`) that runs before development starts.

## Architecture & Code Organization

### Core App Architecture (NestJS)

The core app follows a strict **4-layer architecture** for each module:

1. **Controller** (`*.controller.ts`) - HTTP endpoints + Swagger documentation only
   - NO business logic, NO try-catch, NO logging
   - Returns service method results directly
   - Uses DTOs for request/response validation
   - Prioritizes Swagger and testability

2. **Service** (`*.service.ts`) - Business logic, logging, error handling
   - All application logic lives here
   - Uses `@Injectable()` decorator

3. **Tool** (`*.tool.ts`) - MCP tools that map 1:1 to controller methods
   - Uses `@Tool()` decorator
   - Returns MCP format: `{ content, structuredContent, isError }`
   - Include `outputSchema` in `@Tool` for structured outputs (arrays/objects)
   - Must include progress reporting

4. **Module** (`*.module.ts`) - Dependency injection configuration
   - Uses `@Module()` decorator
   - Configures providers, imports, exports

**Key Rule:** Controller uses DTOs, MCP Tool uses Schemas. DTOs extend 1:1 to Schemas.

### Core Modules

Current modules in `apps/core/src/`:

- **FunctionsModule** - Manages and executes system functions from local directory
- **ShellModule** - Provides persistent shell access for command execution
- **EnvModule** - Environment variable management
- **LLMModule** - AI integration (embeddings, chat) via OpenAI
- **VectorModule** - Semantic search via Qdrant

**MCP Integration:** Configured in `app.module.ts` using `@rekog/mcp-nest` with HTTP Streamable transport.

### Mastra App Architecture

Located in `apps/mastra/src/mastra/`:

- **agents/** - AI agents (e.g., vargosAgent, weatherAgent)
- **tools/** - Custom tools for agents
- **workflows/** - Multi-step workflows
- **memory/** - PostgreSQL-based conversation memory
- **mcp/** - MCP server/client configuration
  - `vargos-mcp-client.ts` - Connects to Core's MCP endpoint
  - `vargos-mcp-server.ts` - Exposes agents via MCP

**Known Issue:** Race condition during `pnpm dev` cold start - Core may not be ready when Mastra tries to connect to MCP endpoint.

## Coding Conventions

### File Naming
- **kebab-case** for files: `app.module.ts`, `env.tool.ts`
- **PascalCase** for classes: `AppModule`, `EnvTool`

### Import Organization
- External packages first, then internal modules
- Alphabetical ordering within groups
- Absolute imports for internal modules

### Architecture Patterns
- Follow repository pattern
- Business logic in service layers
- Controllers focused only on Swagger
- MCP tools must go through controllers

## MCP Tool Implementation

When implementing MCP tools:

1. **File naming:** `*.tool.ts`
2. **Decorator:** Use `@Tool()` from existing practice
3. **1:1 mapping:** Must map to controller methods
4. **Response format:**
   ```typescript
   {
     content: [{ type: "text", text: JSON.stringify(data) }],
     structuredContent: data,
     isError: false
   }
   ```
5. **Output schema:** Include in `@Tool` decorator for structured content
6. **Testing:** Create `*.tool.spec.ts` testing through controller mocks

Reference: [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

## Environment Configuration

### Core App (.env)
```bash
CORE_PORT=4861                # API port (dev uses 8180)
DATA_DIR=                     # Base directory for data storage
FUNCTIONS_DIR=                # Functions repository location
OPENAI_API_KEY=               # Required for LLM operations
QDRANT_URL=                   # Qdrant vector database URL
QDRANT_API_KEY=               # Qdrant authentication
SERP_API_KEY=                 # Optional search API
```

### Mastra App (.env)
```bash
MASTRA_PORT=4862                              # Mastra API port
OPENAI_API_KEY=                               # Required for agents
CORE_MCP_CLIENT_URL=http://localhost:4861/mcp # Core MCP endpoint
DATABASE_URL=                                 # PostgreSQL for memory
```

## External Dependencies

### Core App
- **Vargos Functions Repository:** [github.com/chozzz/vargos-functions-template](https://github.com/chozzz/vargos-functions-template)
  - Functions auto-cloned from external repo
  - Located in `~/.vargos/functions/src/` by default
  - Each function has `functionId.meta.json` metadata
  - Executed via subprocess spawning with pnpm

### Chat App
- **AIChat Repository:** [github.com/sigoden/aichat](https://github.com/sigoden/aichat)
  - Integrated as git submodule in `apps/chat`
  - Rust-based LLM CLI tool
  - Requires Rust/Cargo toolchain to build
  - See `apps/chat/SETUP.md` for configuration

### Runtime Services
- **Qdrant** - Vector database for semantic search (port 6333)
- **PostgreSQL** - Memory storage for Mastra agents
- **OpenAI API** - LLM embeddings and chat

## API Endpoints

Core app exposes:
- `/api/swagger` - Interactive API documentation
- `/api/json` - OpenAPI specification
- `/mcp` - Model Context Protocol endpoint
- `/ping` - Health check
- Module-specific endpoints (functions, shell, env)

## Workspace Configuration

**Active apps:** `core`, `mastra`, `cli`, `chat`
**Disabled apps:** `chatbot` (commented out in `pnpm-workspace.yaml`)
**Git Submodules:** `chat` (from github.com/sigoden/aichat)

When adding new apps/packages, update `pnpm-workspace.yaml` and consider Turborepo task dependencies in `turbo.json`.

## Important Notes

- **Less code is better** - Remove unused or deprecated code
- **Test coverage** - Include spec files for tools and controllers
- **MCP Status** - Currently under development, considered unstable
- **Port conflicts** - Core uses 8180 in dev (overridden by PORT env), 4861 in production
