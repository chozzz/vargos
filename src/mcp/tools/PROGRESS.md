# Vargos MCP Tools - Progress

## Completed Tools (15 tools, 78 tests ✅)

### File Operations
| Tool | Description | Tests |
|------|-------------|-------|
| `read` | Read files (text/images) with offset/limit | 5 |
| `write` | Create/overwrite files | 4 |
| `edit` | Surgical text replacement | 5 |

### Shell & Process
| Tool | Description | Tests |
|------|-------------|-------|
| `exec` | Execute commands | 7 |
| `process` | Background process management | 7 |

### Web
| Tool | Description | Tests |
|------|-------------|-------|
| `web_fetch` | Fetch URLs → markdown/text | 5 |
| `browser` | Browser automation (Playwright) | 10 |

### Memory
| Tool | Description | Tests |
|------|-------------|-------|
| `memory_search` | Search memory files | 4 |
| `memory_get` | Read memory sections | 3 |

### Sessions (Multi-Agent)
| Tool | Description | Tests |
|------|-------------|-------|
| `sessions_list` | List active sessions | 3 |
| `sessions_send` | Send message to session | 2 |
| `sessions_spawn` | Spawn sub-agent | 1 |

### Cron (Scheduling)
| Tool | Description | Tests |
|------|-------------|-------|
| `cron_add` | Schedule recurring tasks | - |
| `cron_list` | List scheduled tasks | - |

## Pi SDK Integration

Vargos MCP tools are now fully integrated with Pi SDK for CLI mode:

```
Vargos (MCP Core) → Pi SDK Extension → Pi Agent Runtime
       ↓                    ↓                    ↓
   15 MCP Tools     Wrapped as Pi Tools    Agent Session
```

### Tool Alignment
System prompt and registered tools are synchronized:
- System prompt lists: `read, write, edit, exec, web_fetch, memory_search, memory_get, sessions_list, sessions_history, sessions_send, sessions_spawn, cron_add, cron_list, process, browser`
- Pi SDK receives same 15 tools via extension
- ✅ No mismatch between what's advertised and what's available

### Session History
- Sessions persisted to `~/.vargos/sessions/`
- Pi SDK JSONL format (OpenClaw-compatible)
- Full bootstrap context injected each run (AGENTS.md, SOUL.md, ARCHITECTURE.md, etc.)

## Architecture

### Clean Service Abstraction
```
core/services/types.ts     → Interfaces (IMemoryService, ISessionService, etc.)
services/memory/file.ts    → File-based implementation
services/memory/qdrant.ts  → Qdrant vector search implementation
services/sessions/file.ts  → JSONL session storage
services/sessions/postgres.ts → PostgreSQL session storage
services/factory.ts        → ServiceFactory + initialization
```

### Swappable Backends
Configure via environment variables:
```bash
# Memory backend
VARGOS_MEMORY_BACKEND=file      # or 'qdrant' or 'postgres'
VARGOS_MEMORY_DIR=~/.vargos/memory

# Sessions backend
VARGOS_SESSIONS_BACKEND=file    # or 'postgres'

# Qdrant (for vector memory)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional
OPENAI_API_KEY=sk-xxx  # for embeddings

# PostgreSQL
POSTGRES_URL=postgresql://user:pass@localhost:5432/dbname
```

### Tools use service interface
All tools use `getMemoryService()` and `getSessionService()` - no implementation details in tools.

## Run Tests

```bash
pnpm test:run        # All tests
pnpm test            # Watch mode
```

## Completed Since Initial Documentation

| Tool | Description | Status |
|------|-------------|--------|
| `cron_add` | Schedule recurring tasks | ✅ Implemented |
| `cron_list` | List scheduled tasks | ✅ Implemented |

## CLI Usage

```bash
# Interactive chat mode
vargos chat --session mysession

# Single task mode
vargos run "List files in src directory"

# With options
vargos run "Analyze codebase" --model gpt-4o --provider openai
```
