# @vargos/core-lib

Core business logic library for Vargos - functions, LLM, vector, shell, and env services.

## Usage

```typescript
import { createCoreServices } from '@vargos/core-lib';

const services = await createCoreServices({
  llm: { provider: 'openai', config: { apiKey: process.env.OPENAI_API_KEY! } },
  vector: { provider: 'qdrant', config: { url: '...', apiKey: '...' } },
  functions: { provider: 'local-directory', config: { functionsDir: '...' } },
  env: { provider: 'filepath' },
  shell: {},
});

// Use services
await services.functionsService.listFunctions();
await services.llmService.generateEmbeddings('text');
```

## Structure

- `core/` - Provider registry, DI container, abstractions
- `llm/` - LLM services and providers
- `vector/` - Vector database services
- `functions/` - Function management and execution
- `env/` - Environment variable management
- `shell/` - Shell execution service
- `factories/` - Service initialization

## Testing

```bash
pnpm test
```
