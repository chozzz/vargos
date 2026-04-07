# Agent v2 Architecture: Self-Referential Execution

## Core Principle

**No `agent.spawn` RPC.** Instead, agents call `agent.execute` as a bus-registered tool. Same service instance handles parent and child runs. SessionKey hierarchy is managed through string concatenation.

---

## Comparison: Old vs New

### Old (v1): Explicit Spawning
```typescript
// channels/whatsapp.ts
const childKey = await bus.call('agent.spawn', {
  sessionKey: 'whatsapp:user123',
  task: 'Find and process customer data',
  agent: 'data-processor'  // Loads skills from definition
});
// Returns immediately, runs in background
// Agent service handles:
// - Session creation
// - Timeout management
// - Parent re-trigger on completion
// - Announce to parent
// - Channel delivery routing
```

**Issues:**
- Agent service is an orchestrator, not just an executor
- Spawn logic mixed with execution logic
- Subagent completion re-triggers embedded in Agent
- Hard to test in isolation
- Channels can't respond directly to agent results (depends on announce + retrigger)

### New (v2): Self-Referential Tool
```typescript
// Agent as a tool, registered on the bus
@register('agent.execute', ...)
async execute(params: AgentExecuteParams): Promise<{ response: string }> {
  // 1. Ensure session exists
  // 2. Add task as user message
  // 3. Build system prompt
  // 4. Run Pi SDK session
  // 5. Emit deltas/tools via events
  // 6. Return response
}

// Agent also exposes the tool to itself
// System prompt includes: "You can call agent.execute(...) with a nested sessionKey"
```

**When agent wants to spawn work:**
```
Agent reads in system prompt:
  "To delegate a task, call agent.execute with a nested sessionKey:
   agent.execute({ sessionKey: 'parent:child-name', task: '...' })"

Agent decides to spawn:
  > Calls tool: agent.execute({
      sessionKey: 'whatsapp:user123:fetch-data',
      task: 'Retrieve customer data from API...'
    })

Pi SDK executes the tool (async, background):
  1. bus.call('agent.execute', ...) is invoked
  2. Same execute() method handles it
  3. New session created at ~.vargos/sessions/whatsapp-user123/whatsapp-user123-fetch-data/
  4. Child runs independently
  5. Child's response is added back to Pi SDK tool results
```

**Benefits:**
- Agent is only responsible for execute() — pure function
- No re-trigger logic in Agent
- No spawn depth tracking in Agent
- Sessions Service handles persistence (unchanged)
- Each service owns its result routing (channels, cron, etc.)

---

## The Tool Interface

### Within Pi SDK System Prompt

Agents have access to `agent.execute` as a callable tool:

```markdown
## Tool: agent.execute

Execute a subtask by spawning a new agent session.

**Parameters:**
- sessionKey (string, required): Child session identifier (format: parent:child-name)
  - Example: "whatsapp:user123:fetch-data"
  - Depth limited to 3 levels (prevents infinite recursion)
- task (string, required): Task description for the child agent
- thinkingLevel (optional): "off" | "low" | "medium" | "high"
- model (optional): Model override for child (defaults to parent's model)

**Returns:**
- response (string): Child agent's final response

**Rules:**
- Child runs in background; you receive its response in tool_result
- Use only for true parallelization or complex subtasks
- Max 10 concurrent children per parent
- Max depth: 3 levels
```

### Bus Callable (Gateway View)

SessionKey convention ensures hierarchy:
```typescript
// Parent calls:
await bus.call('agent.execute', {
  sessionKey: 'whatsapp:user123:search',
  task: 'Search for documents matching "budget"'
})

// Child can call (nested):
await bus.call('agent.execute', {
  sessionKey: 'whatsapp:user123:search:analyze',  // Two levels deep
  task: 'Analyze the first 5 documents and extract key numbers'
})

// At depth 3, further nesting is rejected:
await bus.call('agent.execute', {
  sessionKey: 'whatsapp:user123:search:analyze:summarize',  // Would fail
  task: '...'
})
// Error: Max spawn depth (3) exceeded
```

---

## SessionKey Hierarchy in Practice

### Simple Linear Spawn

**User message:**
```
"Summarize my notes about Q1 sales"
```

**Agent decides:**
```
1. Read memory to fetch notes
   → calls memory.search tool
2. Too much content, spawn summary task
   → calls agent.execute({
       sessionKey: 'whatsapp:user:summarize',
       task: '...'
     })
3. Summary child finishes → response added to parent's message history
4. Parent synthesizes final reply to user
```

**Sessions created:**
```
whatsapp:user                    (root session)
whatsapp:user:summarize          (child, triggered by parent's tool call)
```

**Directory:**
```
~/.vargos/sessions/whatsapp-user/
  whatsapp-user.jsonl
  whatsapp-user-summarize/
    whatsapp-user-summarize.jsonl
```

### Parallel Multi-Spawning

**Agent decides:**
```
Parent: whatsapp:user
├─ Spawns child 1: agent.execute({
│    sessionKey: 'whatsapp:user:fetch-sales',
│    task: '...'
│  })
├─ Spawns child 2: agent.execute({
│    sessionKey: 'whatsapp:user:fetch-inventory',
│    task: '...'
│  })
└─ Spawns child 3: agent.execute({
     sessionKey: 'whatsapp:user:fetch-costs',
     task: '...'
   })

Pi SDK tool_result for each includes child's response.
All three run concurrently (Pi SDK handles async tool execution).
Parent receives all results and synthesizes final answer.
```

**Sessions created:**
```
whatsapp:user
whatsapp:user:fetch-sales
whatsapp:user:fetch-inventory
whatsapp:user:fetch-costs
```

### Nested (Grandchild) Spawning

**Scenario:**
```
Parent: cron:weekly-report
│
└─ Child: cron:weekly-report:summary
   │
   └─ Grandchild: cron:weekly-report:summary:detailed-analysis
```

**Directory:**
```
~/.vargos/sessions/cron-weekly-report/
  cron-weekly-report.jsonl
  cron-weekly-report-summary/
    cron-weekly-report-summary.jsonl
    cron-weekly-report-summary-detailed-analysis/
      cron-weekly-report-summary-detailed-analysis.jsonl
```

**Depth check (before execute):**
```typescript
const depth = sessionKey.split(':').length - 1;
// root (depth=0), child (depth=1), grandchild (depth=2)
if (depth >= MAX_DEPTH) throw new Error('Max depth exceeded');
// MAX_DEPTH = 3, so allows root:child:grandchild but not another level
```

---

## Execution Flow

### AgentRuntime.execute() Core Logic

```typescript
@register('agent.execute', ...)
async execute(params: AgentExecuteParams): Promise<{ response: string }> {
  const { sessionKey, task, model, thinkingLevel, media, notify } = params;

  try {
    // 1. Depth validation
    if (this.getSessionDepth(sessionKey) >= MAX_DEPTH) {
      throw new Error(`Max spawn depth (${MAX_DEPTH}) exceeded`);
    }

    // 2. Ensure session exists (idempotent)
    await this.bus.call('session.create', {
      sessionKey,
      model,
      notify,
      metadata: { parentSessionKey: this.extractParent(sessionKey) }
    });

    // 3. Add task as user message
    await this.bus.call('session.addMessage', {
      sessionKey,
      role: 'user',
      content: task,
    });

    // 4. Run the agent (core loop)
    let result = await this.runAgent(sessionKey, task, params);

    // 5. If thinking-only, re-prompt for response
    if (result.thinkingOnly) {
      log.info(`thinking-only response for ${sessionKey}, re-prompting`);
      result = await this.runAgent(sessionKey, 'Provide your response.', params);
    }

    // 6. Handle failure
    if (!result.success) {
      const errMsg = result.error 
        ? friendlyError(classifyError(result.error))
        : 'Something went wrong.';
      return { response: errMsg };
    }

    // 7. If this is a child, announce completion to parent
    const parent = this.extractParent(sessionKey);
    if (parent) {
      await this.announceCompletion(sessionKey, parent, result.response);
    }

    // 8. Return response (only for immediate caller)
    return { response: result.response };

  } catch (error) {
    // Emit event for observability
    await this.bus.emit('agent.onCompleted', {
      sessionKey,
      success: false,
      error: toMessage(error),
    });
    throw error;
  }
}

private runAgent(sessionKey: string, task: string, params: AgentExecuteParams) {
  // Build Pi SDK config, inject history, prompt, extract response, emit events
  // No spawn/orchestration logic here — pure execution
}

private getSessionDepth(sessionKey: string): number {
  return sessionKey.split(':').length - 1;
}

private extractParent(sessionKey: string): string | null {
  const parts = sessionKey.split(':');
  return parts.length > 1 ? parts.slice(0, -1).join(':') : null;
}

private async announceCompletion(childKey: string, parentKey: string, response: string) {
  // Add to parent session for context when parent continues
  // This is visible in the parent's message history
  await this.bus.call('session.addMessage', {
    sessionKey: parentKey,
    role: 'system',
    content: `[Child completed] ${childKey}\n\n${response}`,
    metadata: { type: 'child_complete', childKey }
  });
}
```

---

## Observability & Result Routing

### No Re-Triggers Needed

**Old model (v1):**
```
1. Child completes
2. Agent announces to parent
3. Agent debounces and re-triggers parent
4. Parent runs again
5. Parent delivers result
```

**New model (v2):**
```
1. Child completes → response added to parent's history
2. Parent continues in same run (if still executing)
   OR parent was waiting for tool_result → tool_result delivered
3. No re-trigger, no announce, no debounce
```

### Channel Result Delivery (Channels Service Owns It)

```typescript
// channels/whatsapp.ts
export class WhatsAppAdapter {
  @on('agent.onCompleted')
  async onAgentCompleted(payload: { sessionKey: string; success: boolean; response?: string }) {
    // Check if this result belongs to a WhatsApp session
    if (!payload.sessionKey.match(/^whatsapp:/)) return;

    // Deliver to channel
    const { channel, userId } = parseSessionKey(payload.sessionKey);
    if (payload.success) {
      await this.sendMessage(userId, payload.response);
    } else {
      await this.sendMessage(userId, `Error: ${payload.error}`);
    }
  }
}
```

### Cron Result Delivery (Cron Service Owns It)

```typescript
// services/cron/index.ts
export class CronService {
  @on('agent.onCompleted')
  async onAgentCompleted(payload: { sessionKey: string; success: boolean; response?: string }) {
    // Check if this result belongs to a cron session
    if (!payload.sessionKey.startsWith('cron:')) return;

    // Extract task ID and delivery targets from session metadata
    const session = await this.bus.call('session.get', { sessionKey: payload.sessionKey });
    const { notify } = session;

    if (notify && payload.success) {
      for (const target of notify) {
        await this.bus.call('channel.send', { sessionKey: target, text: payload.response });
      }
    }
  }
}
```

---

## Concurrency & Rate Limiting

### Per-Session Message Queue (Unchanged)

```typescript
// SessionMessageQueue serializes execute() calls per sessionKey
const queue = new Map<string, Promise<void>>();

async executeQueued(sessionKey: string, task: string) {
  let resolve: () => void;
  const promise = new Promise<void>(r => resolve = r);
  
  const prev = queue.get(sessionKey) || Promise.resolve();
  queue.set(sessionKey, promise);
  
  try {
    await prev;  // Wait for previous execution
    await this.execute({ sessionKey, task });
  } finally {
    resolve!();
    queue.delete(sessionKey);
  }
}
```

### Active Run Tracking

```typescript
private activeRuns = new Map<string, { sessionKey: string; startedAt: number }>();

// Track all active runs across all sessions
// Useful for @register('agent.status') handler
```

---

## Error Handling

### Non-Retryable Errors Fail Fast

```typescript
const NON_RETRYABLE = new Set(['auth', 'rate_limit', 'capability']);

if (NON_RETRYABLE.has(classifyError(error))) {
  throw error;  // Fail immediately
}

// Transient errors (network, 502) retry with backoff
```

### Child Failure Handling

```typescript
// If child execution fails, Pi SDK receives tool_error
// Parent can decide whether to retry, spawn alternate child, or fail up
// This is part of parent's agent logic, not hardcoded in runtime
```

---

## Summary: Services Responsibilities

| Service | Responsibility |
|---------|---|
| **AgentRuntime** | Execute one task: prompt with Pi SDK, emit events, return response |
| **SessionsService** | Persist sessions & messages (JSONL) — handles any sessionKey |
| **ChannelAdapters** | Subscribe to agent.onCompleted, deliver to users |
| **CronService** | Subscribe to agent.onCompleted, deliver to notify targets |
| **MemoryService** | Answer memory queries (unchanged) |
| **WorkspaceService** | Load skills/agents definitions (unchanged) |

**No explicit orchestration service needed** — the Bus handles concurrency via tool execution, and subscribers handle result delivery.
