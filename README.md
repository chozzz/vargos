# Vargos

> **Vargos** is a next-generation orchestration platform designed to bridge Large Language Models (LLMs) with real-world system execution.  
> Built for extensibility, modularity, and self-hosting from the ground up.

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
- **Deployment**: Docker, DigitalOcean (initially)

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

- `apps/core/` - Main API server
  - `src/` - Source code
  - `test/` - Test files
  - `scripts/` - Build and deployment scripts

- `packages/` - Shared packages
  - `eslint-config/` - Shared ESLint configuration
  - `tsconfig/` - Shared TypeScript configuration
  - `ui/` - shadcn component UI library

- `functions/` - System-level functions
  - See [functions/README.md](./functions/README.md) for details

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

Copyright (c) [Vadi Taslim]

All rights reserved.
This project is fully owned by its creator and not open source.

## Related Projects

- [Vargos Functions](https://github.com/chozzz/vargos-functions-template) - Repository of system-level functions
- [Model Context Protocol](https://modelcontextprotocol.io/introduction) - Protocol specification for AI agent communication
