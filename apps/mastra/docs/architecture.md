# Architecture

Design decisions and patterns for Vargos Mastra.

## Design Principles

### 1. Self-Curative Capability

**Problem:** Users request functionality that doesn't exist yet.

**Solution:** Auto-generate function scaffolds when missing functionality is detected.

**Implementation:**
- Agent searches for relevant function via semantic search
- If not found, offers to create it
- Workflow generates complete scaffold (types, metadata, tests)
- Auto-indexes for immediate availability

**Trade-offs:**
- ✅ Extends capabilities automatically
- ✅ Reduces manual development overhead
- ⚠️ Generated code needs manual implementation
- ⚠️ Requires API key validation before creation

### 2. Direct core-lib Integration

**Problem:** MCP adds HTTP overhead and complexity.

**Decision:** Use core-lib directly instead of through MCP.

**Why:**
- **Performance** - No serialization/deserialization
- **Simplicity** - Direct function calls
- **Consistency** - Single source of truth
- **Maintainability** - Easier to debug and extend

**Trade-off:**
- ✅ Faster execution
- ✅ Simpler architecture
- ⚠️ Less decoupled (acceptable for internal use)

### 3. Tool-Per-File Organization

**Problem:** Grouped tool files become large and hard to navigate.

**Decision:** One tool per file (`tool-name.tool.ts`).

**Why:**
- **Discoverability** - Easy to find specific tools
- **Maintainability** - Changes isolated to one file
- **Clarity** - Single responsibility per file
- **Testing** - Isolated unit tests

### 4. Singleton Service Pattern

**Problem:** Initializing core-lib services multiple times wastes resources.

**Decision:** Initialize once, reuse across tools.

**Implementation:**
```typescript
// services/functions.service.ts
let coreServices: CoreServices | null = null;

export async function initializeCoreServices() {
  if (coreServices) return coreServices;
  coreServices = await createCoreServices({...});
  return coreServices;
}
```

**Benefits:**
- Efficient resource usage
- Shared state across tools
- Consistent initialization

## Key Patterns

### Function Creation Workflow

**3-Step Process:**

1. **Check Existing**
   - Prevents duplicates
   - Returns existing function if found
   - Fast filesystem check

2. **Validate API Keys**
   - Maps env vars to services (OpenAI, GitHub, etc.)
   - Provides user-friendly instructions with URLs
   - Blocks creation if critical keys missing
   - Continues with warnings for optional keys

3. **Generate & Index**
   - Creates directory structure
   - Writes metadata, types, implementation template
   - Auto-indexes via core-lib
   - Returns created function immediately

**Why this order:**
- Fail fast (existing check first)
- User feedback before creating files (API key validation)
- Auto-indexing ensures immediate availability

### API Key Detection

**Problem:** Functions fail at runtime due to missing API keys.

**Solution:** Validate before creation, provide clear instructions.

```typescript
const serviceMap = {
  OPENAI_API_KEY: {
    name: 'OpenAI',
    url: 'https://platform.openai.com/api-keys',
    docs: 'https://platform.openai.com/docs'
  },
  // ... more services
};
```

**Benefits:**
- User knows what's needed upfront
- Direct links to API key sources
- Prevents runtime failures

### Agent Orchestration

**Problem:** Complex tasks require multiple specialized agents.

**Solution:** Lazy loading via Mastra registry to avoid circular dependencies.

```typescript
// Get agent dynamically at runtime
const agent = mastra.getAgent(agentName);
const response = await agent.generate(query);
```

**Why lazy loading:**
- Prevents circular import issues
- Agents loaded only when needed
- Registry manages lifecycle

### Workflow as Tool

**Pattern:** Workflows exposed as tools for agents.

**Example:**
```typescript
export const createFunctionTool = createTool({
  id: 'create-function',
  execute: async ({ context }) => {
    // Execute workflow
    const result = await createFunctionWorkflow.execute({
      inputData: context
    });
    return result;
  }
});
```

**Benefits:**
- Workflows reusable across agents
- Consistent tool interface
- State management handled by Mastra

## Integration Points

### core-lib Services

Mastra uses these core-lib services directly:

1. **FunctionsService**
   - `listFunctions()` - Get all functions
   - `searchFunctions(query)` - Semantic search
   - `executeFunction(id, params)` - Run function
   - `createFunction(input)` - Generate new function
   - `getFunctionMetadata(id)` - Get details

2. **EnvService** (future)
   - Environment variable management

3. **VectorService** (via FunctionsService)
   - Semantic search for functions
   - Auto-indexing new functions

4. **LLMService** (via FunctionsService)
   - Generate embeddings for search

### Mastra Framework

Using Mastra's primitives:

1. **Agent**
   - LLM integration (GPT-4o-mini)
   - Tool calling
   - Conversation memory

2. **Workflow**
   - Multi-step processes
   - State management
   - Step composition

3. **Tool**
   - Input/output schemas (Zod)
   - Async execution
   - Error handling

## Data Flow

### Function Execution Flow

```
User Query
    ↓
Vargos Agent
    ↓
search-functions.tool (semantic search via core-lib)
    ↓
Found?
├─ Yes → execute-function.tool
│           ↓
│       FunctionsService.executeFunction()
│           ↓
│       LocalDirectoryProvider (spawns pnpm process)
│           ↓
│       Result
│
└─ No → Offer to create function
        ↓
    create-function.tool
        ↓
    createFunctionWorkflow
        ↓
    FunctionsService.createFunction()
        ↓
    Auto-indexed & ready
```

### Self-Curative Loop

```
1. User: "Get Bitcoin price"
2. Agent searches functions
3. No match found
4. Agent offers to create crypto-get-price
5. User confirms
6. Workflow:
   - Check existing (not found)
   - Check API keys (missing COINGECKO_API_KEY)
   - Explain where to get key
   - Generate scaffold
   - Index function
7. Function ready (needs implementation + API key)
8. Next time: Function found immediately
```

## Trade-offs & Decisions

### Why GPT-4o-mini?

- **Cost-effective** for high-volume agent interactions
- **Fast** response times
- **Sufficient** for tool calling and orchestration
- Can upgrade to GPT-4o for complex reasoning

### Why PostgreSQL for Memory?

- **Persistent** conversation history
- **Scalable** for multiple users
- **Queryable** for analytics
- Mastra's built-in support

### Why Qdrant for Search?

- **Fast** semantic search
- **Accurate** vector similarity
- **Scalable** for large function libraries
- Shared with core app

### Why Separate from apps/core?

**apps/core** = REST/MCP API for external consumers
**apps/mastra** = Agent runtime for internal orchestration

- **Separation of concerns** - Different purposes
- **Independent scaling** - Can scale separately
- **Flexibility** - Core can change without affecting agents
- **Shared logic** - Both use core-lib

## Performance Considerations

### Function Creation
- ~2-5 seconds total
- Filesystem operations are fast
- API key checks add minimal overhead
- Auto-indexing <1 second

### Function Execution
- Depends on function complexity
- Spawned via pnpm subprocess
- Core-lib handles execution

### Semantic Search
- ~100-300ms via Qdrant
- Faster than full-text search for conceptual queries
- Cached embeddings for frequent searches

## Security Considerations

### API Key Handling
- Never logged or exposed
- Environment variables only
- Clear instructions for users
- Validation before function creation

### Function Generation
- Template-based (not arbitrary code execution)
- Validated schemas (Zod)
- Isolated directories
- User confirms before creation

### Background Execution
- Timeout limits (future)
- Resource monitoring (future)
- Error recovery (future)

## Future Enhancements

### Planned
1. **AI-Generated Implementation** - Use LLM to write actual function logic
2. **Function Templates** - Pre-built patterns for common tasks
3. **Workflow Persistence** - Database-backed state for long-running tasks
4. **Multi-Agent Networks** - Dynamic agent creation and coordination

### Under Consideration
1. **Function Versioning** - Track changes to generated functions
2. **Auto-Testing** - Generate and run tests automatically
3. **Performance Monitoring** - Track agent and function metrics
4. **Distributed Execution** - Scale across multiple instances
