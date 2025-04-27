# Vargos Core

The API server for Vargos, responsible for managing functions, executing them, and exposing standardized APIs to LLM agents using OpenAPI and Model Context Protocol (MCP).

## 📂 Project Structure

The project structure follows the recommended best practices and modular architecture from NestJS:

## 🚀 Quick Start

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development server:
   ```bash
   pnpm dev
   ```

The server will be available at `http://localhost:3000`

## 📁 Local Directories

Vargos uses the following local directories:

```
~/.vargos/
├── data/           # Application data storage
└── functions/      # Function templates and custom functions
```

### Environment Variables

```bash
# Custom data directory
export DATA_DIR=/path/to/data

# Custom functions directory
export FUNCTIONS_DIR=/path/to/functions
```

## 📚 API Documentation

- Swagger UI: `/api/swagger`
- OpenAPI JSON: `/api/json`
- MCP Spec: `/mcp`

## 🛠️ Development

### Prebuild Script
The prebuild script (`scripts/prebuild.ts`) handles:
- Directory creation and permissions
- Function template setup
- Environment configuration

### Available Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Start in development mode |
| `pnpm build` | Build for production |
| `pnpm start:prod` | Start production server |
| `pnpm test` | Run tests |

## 📜 License

Copyright (c) Vadi Taslim

All rights reserved.
This project is fully owned by its creator and not open source.
