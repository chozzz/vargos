# Vargos

**Vargos** is a next-generation orchestration platform that bridges Large Language Models (LLMs) with real-world system execution.

> Built for extensibility, modularity, and self-hosting from the ground up.

> **Core Philosophy:** Providing Agents to your Machine - focusing on giving AI agents practical capabilities to execute system actions.

## Overview

Vargos enables AI agents to interact with real-world systems through standardized interfaces (OpenAPI and Model Context Protocol), combining the power of LLMs with practical system execution capabilities.

**Key Features:**
- 🤖 **Multi-Agent Architecture** - 9 specialized agents working together
- 🔍 **RAG-First Approach** - Always search before creating
- 🔧 **Function Repository** - Versioned, searchable function library
- 🧪 **Safe Execution** - Isolated subprocess execution with testing
- 📊 **Semantic Search** - Vector-based function discovery
- 💾 **Hybrid Memory** - PostgreSQL + Qdrant for context management

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL (for Mastra memory)
- Qdrant (optional, for vector search)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chozzz/vargos.git
   cd vargos
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Set up environment variables:**
   ```bash
   # Core app
   cp apps/core/.env.example apps/core/.env

   # Mastra app
   cp apps/mastra/.env.example apps/mastra/.env

   # Edit with your API keys and database URLs
   ```

4. **Start development servers:**
   ```bash
   # Terminal 1: Core API (port 8180 in dev)
   cd apps/core
   pnpm dev

   # Terminal 2: Mastra (port 4862)
   cd apps/mastra
   mastra dev
   ```

## Project Structure

This repository is organized as a **Turborepo monorepo**:

```
vargos/
├── apps/
│   ├── core/           # NestJS API server (Port 8180 dev, 4861 prod)
│   ├── mastra/         # Mastra AI framework - agents & workflows (Port 4862)
│   ├── cli/            # CLI agent (similar to Claude CLI)
│   └── chat/           # AIChat - All-in-one LLM CLI (Rust, git submodule)
│
├── packages/
│   ├── core-lib/       # Shared core services (LLM, Vector, Functions, Env, Shell)
│   ├── eslint-config/  # Shared ESLint configuration
│   ├── typescript-config/ # Shared TypeScript configuration
│   └── ui/             # Shared UI components (shadcn)
│
└── docs/               # Documentation (moved to apps/mastra/docs)
```

### Applications

- **`core`** - NestJS API server exposing functions via OpenAPI and MCP
- **`mastra`** - Multi-agent system with 9 specialized agents and workflows
- **`cli`** - Command-line interface for natural language agent interaction
- **`chat`** - Rust-based LLM CLI (git submodule from [aichat](https://github.com/sigoden/aichat))

### Shared Packages

- **`core-lib`** - Core services (LLM, Vector, Functions, Env, Shell)
- **`eslint-config`** - Shared ESLint rules
- **`typescript-config`** - Shared TypeScript configuration
- **`ui`** - Shared UI components

## Architecture

Vargos implements a 4-layer architecture:

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
│         Core Services Layer                  │
│  LLM, Vector, Functions, Env, Shell          │
└─────────────────────────────────────────────┘
```

### Phase 1-3 Agents

**Phase 1: Foundation**
- **Router Agent** - Entry point, analyzes intent and routes requests
- **Planner Agent** - Breaks complex tasks into actionable steps
- **Curator Agent** - Searches function repository (RAG-first)
- **Permission Agent** - Handles user approval and authorization

**Phase 2: Creation Pipeline**
- **Function Creator Agent** - Generates TypeScript functions with tests
- **Sandbox Agent** - Executes tests safely and diagnoses failures

**Phase 3: Research & Memory**
- **Research Agent** - Gathers information from external sources
- **Memory Agent** - Manages hybrid global + thread memory

## Documentation

Comprehensive documentation is available in `apps/mastra/docs/`:

- **[Architecture](apps/mastra/docs/architecture.md)** - Complete system architecture and design
- **[Contributing](apps/mastra/docs/contributing.md)** - Developer guide for contributors
- **[Agents](apps/mastra/docs/agents.md)** - Reference for all 9 agents with schemas
- **[Tools](apps/mastra/docs/tools.md)** - Tools and core services reference
- **[Functions](apps/mastra/docs/functions.md)** - Function repository design

## Development

### Available Scripts

| Script       | Purpose                                    |
|--------------|--------------------------------------------|
| `pnpm dev`   | Start all applications in development mode |
| `pnpm build` | Build all applications                     |
| `pnpm lint`  | Run linting across all packages            |
| `pnpm test`  | Run tests across all packages              |
| `pnpm format`| Format code with Prettier                  |

### Working with Agents

See [apps/mastra/docs/agents.md](apps/mastra/docs/agents.md) for detailed agent documentation.

Example - using Curator Agent to search functions:

```typescript
import { curatorAgent } from './agents/curator-agent';

const result = await curatorAgent.generate(
  'Find functions that send emails',
  {
    structuredOutput: { schema: CuratorOutputSchema }
  }
);

if (result.object.decision === 'use_existing') {
  console.log('Found:', result.object.topMatch.functionId);
}
```

### Creating New Functions

Functions are stored in `~/.vargos/functions/src/` with structure:

```
category/
└── function-name/
    └── v1/
        ├── index.ts                    # Implementation
        ├── function-name.meta.json     # Metadata
        └── function-name.test.ts       # Tests
```

See [apps/mastra/docs/functions.md](apps/mastra/docs/functions.md) for complete function repository design.

## Tech Stack

- **Monorepo**: [Turborepo](https://turbo.build/repo)
- **Backend**: [NestJS](https://nestjs.com/) (TypeScript)
- **AI Framework**: [Mastra](https://mastra.ai)
- **LLM**: OpenAI GPT-4o / GPT-4o-mini
- **Vector DB**: [Qdrant](https://qdrant.tech)
- **Memory**: PostgreSQL
- **Testing**: [Vitest](https://vitest.dev)
- **API Standards**:
  - [OpenAPI 3.1](https://spec.openapis.org/oas/latest.html)
  - [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- **Package Manager**: [pnpm](https://pnpm.io/)

## Deployment

### Docker Deployment

```bash
# Build
pnpm build

# Deploy with Docker Compose
docker-compose up -d
```

### Environment Variables

**Core App:**
```bash
CORE_PORT=4861
OPENAI_API_KEY=sk-...
QDRANT_URL=http://localhost:6333
FUNCTIONS_DIR=~/.vargos/functions/src
```

**Mastra App:**
```bash
MASTRA_PORT=4862
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://localhost:5432/vargos_mastra
CORE_MCP_CLIENT_URL=http://localhost:4861/mcp
```

## Contributing

We welcome contributions! Please see:
- [Contributing Guide](apps/mastra/docs/contributing.md) - Technical guide for contributors
- [Architecture](apps/mastra/docs/architecture.md) - System architecture overview

### Development Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Ensure all tests pass (`pnpm test`)
6. Submit a pull request

## Roadmap

### Phase 4 (Planned)
- **Crawler Agent** - Web scraping and data extraction
- **Dev Assistant Agent** - Code review and suggestions
- **Evaluator Agent** - Function quality assessment
- **Infrastructure Agent** - Deployment and monitoring

### Future Features
- Multi-language function support (Python, Rust)
- Distributed function execution
- Function marketplace and sharing
- Real-time agent telemetry
- Advanced permission scoping

## Related Projects

- [Vargos Functions Template](https://github.com/chozzz/vargos-functions-template) - Function repository template
- [Model Context Protocol](https://modelcontextprotocol.io) - Protocol specification
- [Mastra Framework](https://mastra.ai) - AI agent framework
- [AIChat](https://github.com/sigoden/aichat) - LLM CLI tool

## License

See [LICENSE.md](./LICENSE.md) for full license terms.

Copyright (c) 2024 Vadi Taslim. All rights reserved.

## Community

- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community chat
- **Discord**: Coming soon

---

**Star this repo** if you find it useful! ⭐
