# @vargos/core-lib

Framework-agnostic core business logic library for Vargos - functions, LLM, vector, shell, and env services.

[![npm version](https://img.shields.io/npm/v/@vargos/core-lib)](https://www.npmjs.com/package/@vargos/core-lib)
[![License](https://img.shields.io/badge/license-SEE%20LICENSE-blue)](LICENSE.md)

## Features

- **LLM Services**: Embeddings and chat completions (OpenAI)
- **Vector Database**: Semantic search and indexing (Qdrant)
- **Function Management**: Discover, search, and execute functions
- **Environment Management**: Read/write environment variables
- **Shell Execution**: Execute shell commands with history
- **Provider Pattern**: Extensible architecture for custom providers
- **DI Container**: Lightweight dependency injection
- **TypeScript**: Full type safety with TypeScript

## Installation

```bash
npm install @vargos/core-lib
# or
pnpm add @vargos/core-lib
# or
yarn add @vargos/core-lib
```

## Prerequisites

- Node.js 20+
- TypeScript 5.9+ (for TypeScript projects)

## Quick Start

```typescript
import { createCoreServices } from '@vargos/core-lib';

const services = await createCoreServices({
  llm: {
    provider: 'openai',
    config: { apiKey: process.env.OPENAI_API_KEY! },
  },
  vector: {
    provider: 'qdrant',
    config: {
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY!,
      port: 443,
    },
  },
  functions: {
    provider: 'local-directory',
    config: { functionsDir: process.env.FUNCTIONS_DIR! },
  },
});

// Use services
const functions = await services.functionsService.listFunctions();
const results = await services.functionsService.searchFunctions('weather', 10);
const embeddings = await services.llmService.generateEmbeddings('Hello world');
```

## API Reference

### Services

#### FunctionsService

```typescript
// List all functions
const functions = await services.functionsService.listFunctions();

// Search functions by query
const results = await services.functionsService.searchFunctions('weather', 10);

// Execute a function
const result = await services.functionsService.executeFunction('weather-get', {
  location: 'NYC',
});

// Index a function for search
await services.functionsService.indexFunction(functionMetadata);
```

#### LLMService

```typescript
// Generate embeddings
const embedding = await services.llmService.generateEmbeddings('text');
const embeddings = await services.llmService.generateEmbeddings(['text1', 'text2']);

// Chat completion
const response = await services.llmService.chat([
  { role: 'user', content: 'Hello' },
]);
```

#### VectorService

```typescript
// Create collection
await services.vectorService.createCollection('my-collection', 1536);

// Search
const results = await services.vectorService.search('query', {
  collectionName: 'my-collection',
  limit: 10,
});

// Index data
await services.vectorService.index({
  collectionName: 'my-collection',
  id: 'doc-1',
  vector: [0.1, 0.2, ...],
  payload: { text: 'content' },
});
```

#### EnvService (Optional)

```typescript
// Get all env vars
const all = services.envService?.getAll();

// Search env vars
const filtered = services.envService?.search('API_KEY', true); // censor sensitive

// Get/Set
const value = services.envService?.get('MY_KEY');
services.envService?.set('MY_KEY', 'value');
```

#### ShellService (Optional)

```typescript
// Execute command
const output = await services.shellService?.execute('ls -la');

// Get history
const history = services.shellService?.getHistory();

// Interrupt running command
services.shellService?.interrupt();
```

## Configuration

### Environment Variables

```bash
OPENAI_API_KEY=your_key_here
QDRANT_URL=https://your-instance.qdrant.io
QDRANT_API_KEY=your_key_here
FUNCTIONS_DIR=/path/to/functions
DATA_DIR=/tmp  # For shell service
```

### Custom Configuration

```typescript
const services = await createCoreServices({
  llm: {
    provider: 'openai',
    config: { apiKey: 'custom-key' },
  },
  vector: {
    provider: 'qdrant',
    config: {
      url: 'http://localhost:6333',
      apiKey: 'key',
      port: 6333,
    },
  },
  functions: {
    provider: 'local-directory',
    config: { functionsDir: '/custom/path' },
  },
  env: {
    provider: 'filepath',
    config: {
      envFilePath: '/custom/.env',
      censoredKeys: ['_SECRET', '_TOKEN'],
    },
  },
  shell: {
    config: {
      dataDir: '/custom/dir',
      shellPath: '/bin/zsh',
    },
  },
});
```

## Architecture

```
core/          # Infrastructure (DI container, registry, tokens)
llm/           # LLM services and providers
vector/        # Vector database services
functions/     # Function management and execution
env/           # Environment variable management
shell/         # Shell execution service
factories/     # Service initialization
```

## Extending Providers

Create custom providers by implementing the provider interfaces:

```typescript
import { LLMProvider } from '@vargos/core-lib';

class CustomLLMProvider implements LLMProvider {
  async initialize() { /* ... */ }
  async generateEmbeddings(text: string) { /* ... */ }
  async chat(messages: Message[]) { /* ... */ }
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint
```

## License

This project is licensed under the Vargos Sustainable Use License. See [LICENSE.md](../../LICENSE.md) for details.

**Note**: Commercial use requires a separate license. Contact vadz77@hotmail.com for commercial licensing.

## Related Projects

- [Vargos](https://github.com/chozzz/vargos) - Main Vargos platform
- [Vargos Functions](https://github.com/chozzz/vargos-functions-template) - Function templates
