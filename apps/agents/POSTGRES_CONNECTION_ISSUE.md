# PostgreSQL Connection Issue from WSL

## Problem

Unable to connect to PostgreSQL server from WSL environment when initializing LangGraph checkpointer.

## Error

```
Error: Connection terminated due to connection timeout
    at /home/choz/dev/vargos/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11
    at async PostgresSaver.setup (...)

[cause]: Error: Connection terminated unexpectedly
    at Connection.<anonymous> (/home/choz/dev/vargos/node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/client.js:136:73)
    at Socket.<anonymous> (/home/choz/dev/vargos/node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/connection.js:62:12)
    at TCP.<anonymous> (node:net:343:12)
```

## Environment

- **OS**: WSL2 (Linux 5.15.133.1-microsoft-standard-WSL2)
- **Node.js**: 20+
- **PostgreSQL Server**: 202.7.224.112:5432
- **Database**: vargos_langchain
- **Package**: @langchain/langgraph-checkpoint-postgres@1.0.0

## Connection String

```
postgresql://postgres:***@202.7.224.112:5432/vargos_langchain
```

## Testing Results

### Direct pg.Pool connection test:
```javascript
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:***@202.7.224.112:5432/vargos_langchain',
  connectionTimeoutMillis: 60000,
});
```

**Result**: Connection terminated unexpectedly

### Same server, different database (vargos_mastra):
**Result**: Connection terminated unexpectedly

## Analysis

The connection is being **actively terminated** by the server or network infrastructure, not timing out naturally. This suggests:

1. ✅ **Firewall blocking WSL → PostgreSQL traffic**
2. ✅ **pg_hba.conf restricting connections from WSL IP**
3. ❓ **SSL/TLS requirement not met**
4. ❓ **Network routing issue in WSL2**

## Configuration Tested

```typescript
connectionPool = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000, // Tested up to 60 seconds
});

const saver = new PostgresSaver(connectionPool, undefined, { schema: "public" });
await saver.setup(); // ❌ Fails here
```

## Questions for LangGraph Team

1. Does `PostgresSaver.setup()` require any specific PostgreSQL extensions or permissions?
2. Are there any known issues with PostgreSQL connections from WSL2 environments?
3. Should we add SSL/TLS options to the pg.Pool configuration?
4. Is there a way to make the checkpointer initialization more resilient to connection issues?

## Workaround Needed

What's the recommended approach when PostgreSQL is unavailable during development?

- Use in-memory checkpointer? (loses persistence)
- Lazy-load checkpointer only when needed?
- Gracefully handle connection failures?

## Related Code

- `apps/agents/src/shared/checkpointer.ts` - Checkpointer initialization
- All graph files call `await getCheckpointer()` at module level

## Expected Behavior

The checkpointer should either:
1. Successfully connect to PostgreSQL, or
2. Provide clear error messages about connection requirements, or
3. Support optional/lazy initialization
