# Session & Agent Run Hierarchy Mapping

## Current Session Storage (SessionsService)

**Location:** `~/.vargos/sessions/`

### Root Sessions
Sessions without subagent markers are stored flat:
```
~/.vargos/sessions/
  main-parent/
    main-parent.jsonl           (file: session metadata + messages)
    tool-results/               (optional: tool call results)
      call_<id>.json
  
  cron-heartbeat-2026-03-19/
    cron-heartbeat-2026-03-19.jsonl
    tool-results/
      call_*.json
```

**SessionKey → Directory mapping:**
- SessionKey: `main:parent`
- Directory: `~/.vargos/sessions/main-parent/` (colons → hyphens)
- File: `main-parent.jsonl`

**File format:** JSONL, first line is metadata (Session), remaining lines are messages (Message[])

### Subagent Sessions
Sessions spawned via `agent.spawn` (old v1) use a nested structure:
```
~/.vargos/sessions/
  main-parent/
    main-parent.jsonl
    subagents/
      main-parent-subagent-1710395000-abc12/
        main-parent-subagent-1710395000-abc12.jsonl
      main-parent-subagent-1710395000-def34/
        main-parent-subagent-1710395000-def34.jsonl
```

**SessionKey → Directory mapping:**
- SessionKey: `main:parent:subagent:1710395000-abc12`
- Directory: `~/.vargos/sessions/main-parent/subagents/main-parent-subagent-1710395000-abc12/`
- File: `main-parent-subagent-1710395000-abc12.jsonl`

**Resolution logic** (`lib/paths.ts`):
```typescript
export function resolveSessionDir(sessionKey: string): string {
  const { sessionsDir } = getDataPaths();
  const subIdx = sessionKey.indexOf(':subagent:');
  if (subIdx >= 0) {
    const root = sessionKey.slice(0, subIdx);              // "main:parent"
    const sub  = sessionKey.slice(subIdx + 1);            // "subagent:..."
    return path.join(sessionsDir, 
      sessionKeyToDir(root),                                // "main-parent"
      'subagents', 
      sessionKeyToDir(sub)                                  // "main-parent-subagent-..."
    );
  }
  return path.join(sessionsDir, sessionKeyToDir(sessionKey));
}

export function sessionKeyToDir(key: string): string {
  return key.replace(/:/g, '-');  // All colons → hyphens
}
```

---

## v2 Agent Architecture: Self-Referential Execution

**Change:** No more `agent.spawn` RPC. Instead:
- Agents call `agent.execute` as a tool (same Agent service instance)
- SessionKey hierarchy is explicit: `parentKey:childKey:grandchildKey`
- Drops the `:subagent:` marker — simpler tree structure

### New SessionKey Hierarchy Pattern

Instead of:
```
main:parent:subagent:1710395000-abc12:subagent:1710395000-def34
```

Use:
```
main:parent:child-1:grandchild-1
main:parent:child-2
main:parent:child-1:grandchild-2
```

**Directory structure stays identical:**
```
~/.vargos/sessions/
  main-parent/
    main-parent.jsonl
    <subagent-or-child>/
      main-parent-child-1/
        main-parent-child-1.jsonl
        <subagent-or-child>/
          main-parent-child-1-grandchild-1/
            main-parent-child-1-grandchild-1.jsonl
      main-parent-child-2/
        main-parent-child-2.jsonl
```

### New Resolution Logic

For v2, simplify `resolveSessionDir()`:

```typescript
/**
 * Resolve session directory honoring colon-based hierarchy.
 * main:parent:child:grandchild 
 *   → ~/.vargos/sessions/main-parent/
 *     then main-parent-child/
 *     then main-parent-child-grandchild/
 */
export function resolveSessionDir(sessionKey: string): string {
  const { sessionsDir } = getDataPaths();
  const parts = sessionKey.split(':');
  
  if (parts.length === 1) {
    // Root: main:parent → ~/.vargos/sessions/main-parent/
    return path.join(sessionsDir, sessionKeyToDir(sessionKey));
  }
  
  // Nested: main:parent:child:grandchild
  // Build: ~/.vargos/sessions/main-parent/main-parent-child/main-parent-child-grandchild/
  const root = parts[0];
  let current = path.join(sessionsDir, sessionKeyToDir(root));
  
  for (let i = 1; i < parts.length; i++) {
    const childKey = [root, ...parts.slice(1, i + 1)].join(':');
    current = path.join(current, sessionKeyToDir(childKey));
  }
  
  return current;
}
```

---

## Agent Run Tracking (New)

**Purpose:** Track execution state, metrics, and hierarchy for agent runs (separate from session message history).

**Location:** `~/.cache/vargos/agent-runs/`

### Structure (mirrors session hierarchy)

```
~/.cache/vargos/agent-runs/
  main-parent/
    run.jsonl                 (runs for "main:parent")
  
  main-parent/main-parent-child-1/
    run.jsonl                 (runs for "main:parent:child-1")
    
  main-parent/main-parent-child-1/main-parent-child-1-grandchild-1/
    run.jsonl                 (runs for "main:parent:child-1:grandchild-1")
```

### Run Entry Format (JSONL)

```json
{
  "runId": "run-1710395000-abc",
  "sessionKey": "main:parent:child-1",
  "status": "completed",
  "startedAt": 1710395000000,
  "completedAt": 1710395003000,
  "duration": 3000,
  "success": true,
  "tokens": {
    "input": 2048,
    "output": 512,
    "total": 2560
  },
  "toolCalls": [
    {
      "toolName": "agent.execute",
      "duration": 1500,
      "success": true
    },
    {
      "toolName": "memory.search",
      "duration": 200,
      "success": true
    }
  ]
}
```

---

## Mapping Examples

### Example 1: Channel Session with Self-Loop

**Channel user sends message → Agent spawns subtask:**

```
sessionKey:        "whatsapp:1234567890"
├─ message 1:      "Write a summary of my notes"
├─ message 2:      assistant, calls agent.execute tool
│
└─ agent spawns:   "whatsapp:1234567890:search"
   ├─ message 1:   "Find all notes matching: <query>"
   ├─ message 2:   assistant, calls memory.search
   ├─ message 3:   tool result (memory content)
   ├─ message 4:   assistant synthesizes response
   │
   └─ agent spawns: "whatsapp:1234567890:search:summary"
       ├─ message 1: "Summarize these findings..."
       ├─ message 2: assistant, tool calls
       └─ message 3: final summary
```

**Directory structure:**
```
~/.vargos/sessions/whatsapp-1234567890/
  whatsapp-1234567890.jsonl
  whatsapp-1234567890-search/
    whatsapp-1234567890-search.jsonl
    whatsapp-1234567890-search-summary/
      whatsapp-1234567890-search-summary.jsonl
```

### Example 2: Cron Task with Multi-Level Spawning

```
sessionKey:        "cron:daily-sync:2026-04-02"
└─ spawns:         "cron:daily-sync:2026-04-02:fetch"
   └─ spawns:      "cron:daily-sync:2026-04-02:fetch:transform"
                   (self-calls agent.execute with appended key)
```

**Directory structure:**
```
~/.vargos/sessions/cron-daily-sync-2026-04-02/
  cron-daily-sync-2026-04-02.jsonl
  cron-daily-sync-2026-04-02-fetch/
    cron-daily-sync-2026-04-02-fetch.jsonl
    cron-daily-sync-2026-04-02-fetch-transform/
      cron-daily-sync-2026-04-02-fetch-transform.jsonl
```

---

## Implementation Notes

1. **SessionsService unchanged:** Already handles the JSONL persistence correctly for any sessionKey pattern.

2. **Agent execution:** When agent calls itself:
   ```typescript
   await bus.call('agent.execute', {
     sessionKey: `${params.sessionKey}:task-name`,  // Append child key
     task: '...',
   })
   ```

3. **Depth limiting:** Same logic as before, but count colons instead of `:subagent:`:
   ```typescript
   const depth = sessionKey.split(':').length - 1;
   if (depth > MAX_DEPTH) throw new Error('Max depth exceeded');
   ```

4. **Reaper TTL:** SessionsService continues to prune based on session kind inference:
   - `cron:` sessions → 7 days
   - Nested sessions (children) → 3 days
   - Main sessions → keep indefinitely

5. **Run tracking:** New AgentRunsService mirrors this structure in `~/.cache/vargos/agent-runs/` for observability.
