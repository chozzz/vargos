# Vargos Architecture

Clean, maintainable MCP server architecture with swappable backends.

## Core Principles

1. **Interface Segregation** - Core defines interfaces, implementations live in services/
2. **Dependency Inversion** - Tools depend on interfaces, not implementations
3. **Backend Agnostic** - Switch between file/Qdrant/Postgres without changing tools
4. **Testability** - Mock services easily, test in isolation

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  MCP Tools (12 tools)                                    │
│  read, write, edit, exec, process, browser, etc.        │
├─────────────────────────────────────────────────────────┤
│  Service Interface (core/services/types.ts)             │
│  IMemoryService, ISessionService, IVectorService        │
├─────────────────────────────────────────────────────────┤
│  Service Implementations (services/)                     │
│  FileMemoryService, QdrantMemoryService, etc.           │
├─────────────────────────────────────────────────────────┤
│  Infrastructure (file, postgres, qdrant clients)        │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── core/
│   ├── services/
│   │   └── types.ts          # Service interfaces
│   └── tools/
│       ├── types.ts          # Tool interfaces
│       └── base.ts           # BaseTool class
│
├── services/
│   ├── factory.ts            # ServiceFactory + initialization
│   │
│   ├── memory/
│   │   ├── file.ts           # File-based memory (default)
│   │   └── qdrant.ts         # Qdrant vector search
│   │
│   ├── sessions/
│   │   ├── file.ts           # JSONL session storage
│   │   └── postgres.ts       # PostgreSQL sessions
│   │
│   ├── browser.ts            # Browser automation service
│   └── process.ts            # Process management service
│
├── mcp/tools/                # MCP tool implementations
│   ├── registry.ts           # Tool registration
│   ├── read.ts, write.ts     # File tools
│   ├── memory-*.ts           # Memory tools
│   ├── sessions-*.ts         # Session tools
│   └── ...
│
└── index.ts                  # Entry point + service init
```

## Service Interfaces

### IMemoryService
```typescript
interface IMemoryService {
  name: string;
  
  // CRUD
  write(path: string, content: string, options?: { mode?, metadata? }): Promise<void>;
  read(path: string, options?: { offset?, limit? }): Promise<string>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  list(directory: string): Promise<string[]>;
  
  // Search (text or vector)
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

**Implementations:**
- `FileMemoryService` - Plain text files, regex search
- `QdrantMemoryService` - Vector DB with semantic search (requires OpenAI for embeddings)

### ISessionService
```typescript
interface ISessionService {
  name: string;
  events: EventEmitter;
  
  // Session CRUD
  create(session): Promise<Session>;
  get(sessionKey): Promise<Session | null>;
  update(sessionKey, updates): Promise<Session | null>;
  delete(sessionKey): Promise<boolean>;
  list(options?): Promise<Session[]>;
  
  // Messaging
  addMessage(message): Promise<SessionMessage>;
  getMessages(sessionKey, options?): Promise<SessionMessage[]>;
  
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

**Implementations:**
- `FileSessionService` - JSONL files, one per session
- `PostgresSessionService` - Relational DB with proper indexing

## Configuration

Environment variables control backend selection:

```bash
# Required: Choose backends
VARGOS_MEMORY_BACKEND=file        # file | qdrant | postgres
VARGOS_SESSIONS_BACKEND=file      # file | postgres

# File backend config
VARGOS_MEMORY_DIR=~/.vargos/memory

# Qdrant config (for vector memory)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-api-key       # optional
OPENAI_API_KEY=sk-xxx            # for embeddings

# PostgreSQL config
POSTGRES_URL=postgresql://user:pass@host:port/db
```

## Service Factory Pattern

```typescript
// services/factory.ts
export class ServiceFactory {
  createMemoryService(): IMemoryService {
    switch (config.memory) {
      case 'file': return new FileMemoryService(config);
      case 'qdrant': return new QdrantMemoryService(config);
      case 'postgres': throw new Error('Not implemented');
    }
  }
  
  createSessionService(): ISessionService {
    switch (config.sessions) {
      case 'file': return new FileSessionService(config);
      case 'postgres': return new PostgresSessionService(config);
    }
  }
}

// Global initialization
export async function initializeServices(config): Promise<void> {
  const factory = new ServiceFactory(config);
  const memory = factory.createMemoryService();
  const sessions = factory.createSessionService();
  
  await memory.initialize();
  await sessions.initialize();
  
  globalServices = { memory, sessions };
}

// Tool usage
export function getMemoryService(): IMemoryService {
  return globalServices.memory;
}
```

## Adding New Service Implementations

1. **Create implementation** in `services/<type>/<name>.ts`
2. **Implement interface** from `core/services/types.ts`
3. **Register in factory** `services/factory.ts`
4. **Add tests** in `services/<type>/<name>.test.ts`

Example: Adding Redis for sessions
```typescript
// services/sessions/redis.ts
export class RedisSessionService implements ISessionService {
  name = 'redis';
  // ... implement all methods
}

// services/factory.ts
import { RedisSessionService } from './sessions/redis.js';

createSessionService() {
  if (config.sessions === 'redis') {
    return new RedisSessionService(config);
  }
  // ... existing
}
```

## Tools Don't Know About Backends

```typescript
// mcp/tools/memory-search.ts
import { getMemoryService } from '../../services/factory.js';

export const memorySearchTool: Tool = {
  execute: async (args) => {
    const memory = getMemoryService();  // ← Interface, not implementation
    const results = await memory.search(args.query);
    // Works regardless of file/qdrant/postgres backend
  }
};
```

## Testing Strategy

### Unit Tests (Service Level)
```typescript
// Test file-based memory
test('file memory', async () => {
  const memory = new FileMemoryService({ baseDir: '/tmp/test' });
  await memory.initialize();
  await memory.write('test.md', 'Hello');
  const result = await memory.read('test.md');
  expect(result).toBe('Hello');
});

// Test Qdrant memory (if available)
test('qdrant memory', async () => {
  if (!qdrantAvailable) return; // Skip
  const memory = new QdrantMemoryService({ url: 'http://localhost:6333' });
  // ... same test
});
```

### Integration Tests (Tool Level)
```typescript
// Test with file backend
test('memory search with file backend', async () => {
  await initializeServices({ memory: 'file', sessions: 'file' });
  // Test tool...
});
```

## Migration Path

### Current → Target
| Current | Upgrade Path |
|---------|-------------|
| File memory → Qdrant | Set `VARGOS_MEMORY_BACKEND=qdrant`, restart. Data stays in files until you migrate. |
| File sessions → Postgres | Set `VARGOS_SESSIONS_BACKEND=postgres`, restart. Old sessions still readable. |

### Migration Script (Future)
```typescript
// scripts/migrate-memory.ts
async function migrateToQdrant() {
  const fileMemory = new FileMemoryService({ baseDir: '...' });
  const qdrantMemory = new QdrantMemoryService({ url: '...' });
  
  for (const file of await fileMemory.list('')) {
    const content = await fileMemory.read(file);
    await qdrantMemory.write(file, content);
  }
}
```

## Performance Considerations

| Backend | Pros | Cons |
|---------|------|------|
| **File** | Zero deps, fast for small data, simple | Regex search O(n), no concurrency |
| **Qdrant** | Semantic search, fast vector queries | Requires container, OpenAI key |
| **Postgres** | ACID, complex queries, proven | Requires DB server |

**Recommendation:**
- **Development:** File for everything
- **Production single-user:** Qdrant for memory, File for sessions
- **Production multi-user:** Qdrant for memory, Postgres for sessions

## 12 Tools Complete

| Category | Tools | Tests |
|----------|-------|-------|
| File | read, write, edit | 14 |
| Shell | exec, process | 14 |
| Web | web_fetch, browser | 15 |
| Memory | memory_search, memory_get | 7 |
| Sessions | sessions_list, sessions_send, sessions_spawn | 6 |
| **Total** | **12** | **56** |

All tests pass with any backend combination.
