# agent-q2 vs agent-v2: Architecture Comparison

## Overview

| Aspect | agent-q2 | agent-v2 |
|--------|----------|----------|
| **Total Lines** | 1,299 | 544 |
| **Callables** | 4 (`execute`, `spawn`, `abort`, `status`) | 4 (same) |
| **Event Handlers** | 0 | 1 (`@on('channel.onInbound')`) |
| **Private Methods** | 15 | 15 |
| **Separate Classes** | 1 (AgentLifecycle) | 0 |
| **Orchestration Scope** | Agent execution + subagent re-trigger | Agent execution + subagent + channel routing + cron routing |

---

## Detailed Breakdown

### agent-q2: Explicit Lifecycle Tracking

**Design principle:** Port v1 runtime faithfully, make complexity visible

**Responsibilities:**
1. Execute agent (buildPiSession, injectHistory, promptWithRetry, extractRunResult)
2. Stream events (AgentLifecycle manages activeRuns, emits stream events)
3. Subagent orchestration (handleSubagentCompletion, triggerParentRun, retrigger debounce)

**AgentLifecycle class (separate):**
```typescript
class AgentLifecycle extends EventEmitter {
  startRun(runId, sessionKey)
  endRun(runId, tokens)
  errorRun(runId, error)
  abortRun(runId, reason)
  streamAssistant(runId, content, isComplete)
  streamTool(runId, toolName, phase, args, result, error)
  streamCompaction(runId, tokensBefore, summary)
  listActiveRuns()
  abortSessionRuns(sessionKey, reason)
}
```

**Key state:**
```typescript
private activeRuns: Map<string, { sessionKey, startedAt, abortController }>
private retriggerTimers: Map<string, NodeJS.Timeout>
private lifecycle: AgentLifecycle  // separate instance
```

**Subagent Logic:**
- handleSubagentCompletion: Fetch parent key, announce, debounce re-trigger
- announceToParent: Add system message to parent
- triggerParentRun: Re-execute parent with context
- (No routeParentResult — parent run handles its own delivery)

**Missing:** Channel message handling, channel delivery, cron delivery routing

**Honesty score:** High — all complexity is visible in the code structure

---

### agent-v2: Distributed Responsibility (but still concentrated in Agent)

**Design principle:** Slim down v1, handle channel/cron routing at source

**Responsibilities:**
1. Execute agent (buildPiAgentConfig, subscribeToStream, runAgent)
2. Channel message handling (onChannelInbound, handleChannelMessage, preprocessMedia)
3. Channel delivery routing (deliverToChannel, stripHeartbeatToken)
4. Cron delivery routing (deliverToNotifyTargets)
5. Subagent orchestration (handleSubagentCompletion, announceToParent, triggerParentRun, routeParentResult)

**Key state:**
```typescript
private sessions: Map<string, AgentSession>  // Pi SDK sessions cache
private activeRuns: Map<string, { sessionKey, startedAt, abortController }>
private retriggerTimers: Map<string, NodeJS.Timeout>
private stats: AgentStats
```

**Extra methods vs q2:**
- `start()` — lifecycle hook
- `ensureSession(sessionKey)` — lazy-load Pi SDK sessions
- `onChannelInbound(@on decorator)` — subscribe to channel messages
- `handleChannelMessage(...)` — preprocess media, parse directives, invoke runAgent, deliver
- `preprocessMedia(...)` — transcription, image description
- `deliverToChannel(...)` — route results back to channel
- `deliverToNotifyTargets(...)` — route results to cron notify targets
- `routeParentResult(...)` — smart routing (cron vs channel)
- `stripHeartbeatToken(...)` — filter cron heartbeat markers

**Subagent Logic:**
- handleSubagentCompletion: Announce + debounce re-trigger
- announceToParent: Add system message
- triggerParentRun: Re-execute parent
- **routeParentResult (new):** Check active children, route to notify or channel

**Honesty score:** Low — tries to hide orchestration in "private" methods, but owns too much

---

## Orchestration Analysis

### What Should Each Service Own?

**Ideal (from v2-agent-design.md):**
- **Agent:** Only execute() — pure prompt loop
- **ChannelAdapters:** Subscribe to agent.onCompleted, deliver their own results
- **CronService:** Subscribe to agent.onCompleted, deliver to notify targets
- **Bus:** Coordinate via events, not Agent ownership

### What agent-q2 Actually Owns

✅ **Execute** — buildSystemPrompt, inject history, prompt Pi SDK, emit deltas/tools
✅ **Subagent re-trigger** — debounce timer, re-run parent with context
❌ **Channel delivery** — NOT owned (missing)
❌ **Cron delivery** — NOT owned (missing)

**Verdict:** Focused on execution + subagent loop. Ignores channel/cron entirely (they handle themselves).

### What agent-v2 Actually Owns

✅ **Execute** — buildPiAgentConfig, subscribe to stream, runAgent
✅ **Channel message inbound** — @on('channel.onInbound')
✅ **Channel message preprocessing** — media transform, directives parsing
✅ **Channel delivery** — deliverToChannel RPC calls
✅ **Cron delivery** — deliverToNotifyTargets RPC calls
✅ **Subagent re-trigger** — announce, debounce, routeParentResult

❌ **Over-ownership:** Agent should NOT own channel or cron routing

**Verdict:** Overengineered — Agent is trying to be a message broker AND executor.

---

## Method Count by Concern

### agent-q2

| Concern | Methods | Lines |
|---------|---------|-------|
| **Execution** | executeRun, buildSystemPromptText, buildPiSession, injectHistory, promptWithRetry, extractRunResult, buildRunMetadata, subscribeToSessionEvents, handleCompactionEvent, storeResponse | ~700 |
| **Subagent** | handleSubagentCompletion, announceToParent, triggerParentRun | ~100 |
| **Lifecycle mgmt** | AgentLifecycle class (startRun, endRun, errorRun, abortRun, streamAssistant, streamTool, streamCompaction, etc.) | ~150 |
| **Helpers** | findLastAssistantMessage | ~20 |

### agent-v2

| Concern | Methods | Lines |
|---------|---------|-------|
| **Execution** | buildPiAgentConfig, subscribeToStream, runAgent | ~200 |
| **Subagent** | handleSubagentCompletion, announceToParent, triggerParentRun, routeParentResult | ~150 |
| **Channel handling** | onChannelInbound, handleChannelMessage, preprocessMedia, deliverToChannel | ~120 |
| **Cron handling** | deliverToNotifyTargets | ~30 |
| **Session mgmt** | ensureSession | ~40 |
| **Helpers** | stripHeartbeatToken, buildPiAgentConfig | ~20 |

---

## Coupling Analysis

### agent-q2 Coupling

```
AgentRuntime → SessionsService (RPC: session.create, addMessage, getMessages)
           → Bus (emit: agent.onCompleted, agent.onDelta, agent.onTool)
           → Workspace (load system prompt)
           → Memory (via tools)
           → Config (get model, thinking level)
```

**No coupling to:**
- ChannelAdapters
- CronService
- Channels integration

**Clean:** Agents/subagents don't know about delivery mechanisms.

### agent-v2 Coupling

```
AgentRuntime → SessionsService (RPC: create, addMessage, getMessages)
           → ChannelService (RPC: channel.send)  ← COUPLING
           → CronService (implicit notify targets)  ← COUPLING
           → Bus (emit: agent.onCompleted, agent.onTool, onDelta)
           → Bus (subscribe: channel.onInbound)  ← REVERSE COUPLING
           → Workspace, Memory, Config
```

**Tight coupling to:**
- ChannelAdapters (knows about channel.send RPC, channels concepts)
- CronService (knows about notify targets, cron delivery)

**Not clean:** Agent is aware of and depends on channel/cron architecture.

---

## Code Reuse & Duplication

### agent-q2
- ~1,300 lines — all v1 runtime code ported verbatim
- No attempt to simplify; complexity is honest
- AgentLifecycle is a reusable abstraction for lifecycle + event stream

### agent-v2
- ~544 lines — attempts to simplify from q2
- BUT adds 100+ new lines for channel/cron routing
- NOT shorter overall when you count new complexity added
- Lifecycle tracking is inline (no separate class)

---

## Which is Better for v2?

### agent-q2: Pros & Cons

**Pros:**
- Honest about complexity (AgentLifecycle makes it visible)
- Focused: execution + subagent loop only
- No channel/cron coupling
- Easier to replace (doesn't break channel/cron if updated)

**Cons:**
- 1,300 lines is bloated
- Still has v1 code patterns (not refactored for self-referential model)
- Still has spawn() RPC (should be tool call in future)

**Verdict:** Better foundation, but needs refactoring to true self-referential model.

### agent-v2: Pros & Cons

**Pros:**
- Attempts to consolidate responsibilities
- Shorter line count (if you ignore added channel/cron logic)
- Tries to own channel inbound handling

**Cons:**
- Over-orchestrated: owns channel/cron delivery (domain boundary violation)
- Tight coupling to multiple services
- Hides complexity in private methods (not honest)
- Still has spawn() RPC (should be tool call)
- routeParentResult adds complexity without clear ownership

**Verdict:** Wrong direction — adds coupling instead of reducing it.

---

## Recommendation for True v2

Neither prototype is correct. The ideal would:

**Keep from q2:**
- Execute-focused design
- AgentLifecycle (but simpler)
- No channel/cron orchestration

**Reject from both:**
- spawn() RPC (replaced by tool call in system prompt)
- Subagent re-trigger logic (parent gets child response via tool_result)
- Channel/cron delivery in Agent
- retriggerTimers and debounce (no longer needed)

**New architecture:**
```typescript
export class AgentRuntime {
  // Core execution only
  @register('agent.execute')
  async execute(params): Promise<{ response }> {
    // 1. Ensure session
    // 2. Add task message
    // 3. Run Pi SDK prompt
    // 4. Emit events (deltas, tools, completion)
    // 5. Return response
  }

  @on('channel.onInbound')
  onChannelInbound(payload) {
    // Just invoke execute, let channels handle delivery
    this.bus.call('agent.execute', {
      sessionKey: payload.sessionKey,
      task: payload.content,
    }).catch(err => log.error(err));
  }

  private async runAgent(...): Promise<AgentRunResult> {
    // Execute Pi SDK, manage history, emit deltas
  }

  // No: spawn, subagent orchestration, channel delivery, cron delivery, re-triggers
}
```

**Size:** ~200-250 lines (down from both)

**Honesty:** Complete — does one thing well
