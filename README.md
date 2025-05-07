# Vargos

**Vargos** is a next-generation orchestration platform designed to bridge Large Language Models (LLMs) with real-world system execution.

> Built for extensibility, modularity, and self-hosting from the ground up.

> Focusing more on providing Agents to your Machine.

## Overview

Vargos enables AI agents to interact with real-world systems through a standardized interface, combining the power of LLMs with practical system execution capabilities.

## Project Structure

This repository is organized as a **Turborepo** containing multiple applications and packages:

```
vargos/
├── apps/
│   └── core/           # Main API server (NestJS)
├── packages/           # Shared packages
```

### Applications

- **`core`** — Main API server built with NestJS, exposing functions via OpenAPI and Model Context Protocol (MCP)

## Tech Stack

- **Monorepo Management**: [Turborepo](https://turbo.build/repo)
- **Backend**: [NestJS](https://nestjs.com/) (TypeScript)
- **API Standards**: 
  - [OpenAPI 3.1](https://spec.openapis.org/oas/latest.html)
  - [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)
- **Package Manager**: [pnpm](https://pnpm.io/)
- **Deployment**: Docker

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm 8+
- Docker (for local development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/chozzz/vargos.git
   cd vargos
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

The API server will be available at `http://localhost:3000`

## Development

### Available Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start all applications in development mode |
| `pnpm build` | Build all applications |
| `pnpm lint` | Run linting across all packages |
| `pnpm test` | Run tests across all packages |

### Project Structure

```
vargos/
├── apps/                        # Application entrypoints
│   ├── core/                    # Main API server (NestJS)
│   ├── ...                      # (Future plan) Docs, UI (Chat, Portal Hub)
├── packages/                    # Shared packages and libraries
│   ├── eslint-config/           # Shared ESLint configuration
│   ├── typescript-config/       # Shared TypeScript configuration
│   └── ui/                      # Shared UI component library (shadcn)
```


## Deployment

### Self-Hosted Deployment

1. Build the project:
   ```bash
   pnpm build
   ```

2. Deploy using Docker:
   ```bash
   docker-compose up -d
   ```

### Managed Hosting

Managed hosting is available for users who prefer turnkey deployments. Each user runs on isolated containerized infrastructure.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

See [LICENSE.md](./LICENSE.md) for full license terms.

Copyright (c) 2024 Vadi Taslim. All rights reserved.

## Related Projects

- [Vargos Functions](https://github.com/chozzz/vargos-functions-template) - Repository of system-level functions
- [Model Context Protocol](https://modelcontextprotocol.io/introduction) - Protocol specification for AI agent communication
