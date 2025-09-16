# Vargos MCP Tools - Progress

## Completed Tools (12 tools, 56 tests ✅)

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

## Skipped (Intentionally)

- Gateway tools (requires OpenClaw infrastructure)
- Message tools (WhatsApp, Telegram, etc.)
- Cron scheduling

These can be added later if needed.
