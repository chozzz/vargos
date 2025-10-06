# Vargos Architecture Review

**Date:** 2026-02-06  
**Reviewer:** Code Review (Manual)  
**Scope:** Session lifecycle, error handling, race conditions

---

## Issues Found

### 1. 🔴 Pi Runtime - Missing Session Existence Checks

**Location:** `src/pi/runtime.ts`

**Issue:** Two methods don't check if sessions exist before adding messages:

#### A. `handleCompactionEvent` (lines 145-178)
```typescript
private async handleCompactionEvent(...): Promise<void> {
  const sessions = getSessionService();
  // ...
  await sessions.addMessage({  // Line 167 - No session existence check!
    sessionKey: vargosSessionKey,
    content: message,
    ...
  });
}
```

**Risk:** If the session is deleted during compaction, this will throw.

**Fix:** Add session check:
```typescript
const session = await sessions.get(vargosSessionKey);
if (!session) return; // Session deleted, skip
```

#### B. `announceResult` (lines 183-218)
```typescript
private async announceResult(...): Promise<void> {
  const sessions = getSessionService();
  // ...
  await sessions.addMessage({  // Line 207 - No session existence check!
    sessionKey: parentSessionKey,
    ...
  });
}
```

**Risk:** If parent session is deleted before subagent completes, this throws.

**Fix:** Add session check before adding message.

---

### 2. 🟡 Pi Runtime - Session File Path Issue

**Location:** `src/mcp/tools/sessions-spawn.ts:74`

**Issue:** The session file path is stored in metadata but may not exist:
```typescript
sessionFile: childSession.metadata?.sessionFile as string,
```

The `childSession.metadata?.sessionFile` is set by the session service, but there's no guarantee the directory exists.

**Fix:** Ensure directory creation in Pi runtime before using session file.

---

### 3. 🟡 File Session Service - Race Condition

**Location:** `src/services/sessions/file.ts:85-112`

**Issue:** The `loadSession` method reads the file, but between `fs.access` and `fs.readFile`, the file could be deleted by another process.

```typescript
private async loadSession(sessionKey: string): Promise<SessionFile | null> {
  const filePath = this.getSessionPath(sessionKey);
  
  try {
    await fs.access(filePath);  // Check
  } catch {
    return null;
  }

  const content = await fs.readFile(filePath, 'utf-8');  // Race condition here!
  ...
}
```

**Fix:** Combine check and read, handle ENOENT:
```typescript
private async loadSession(sessionKey: string): Promise<SessionFile | null> {
  const filePath = this.getSessionPath(sessionKey);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // ... parse
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw;
  }
}
```

---

### 4. 🟡 CLI - Missing Error Handling for Session Creation

**Location:** `src/cli.ts:48-58` (chat command)

**Issue:** If `sessions.create()` fails, the error propagates without context:
```typescript
await sessions.create({
  sessionKey,
  kind: 'main',
  ...
});
```

**Fix:** Wrap with try-catch and provide user-friendly error:
```typescript
try {
  await sessions.create({...});
} catch (err) {
  console.error(chalk.red(`Failed to create session: ${err.message}`));
  process.exit(1);
}
```

---

### 5. 🟢 Minor: Inconsistent Error Messages

**Location:** Various tools

**Issue:** Error messages are inconsistent:
- `sessions_list`: "Sessions list failed: ${message}"
- `sessions_send`: "Sessions send failed: ${message}"
- `sessions_spawn`: "Sessions spawn failed: ${message}"

**Recommendation:** Standardize error format:
```typescript
return errorResult(`${this.name} failed: ${message}`);
```

---

## Positive Findings

### ✅ Session Tools Properly Create Sessions

All session tools correctly handle missing sessions:
- `sessions-send.ts:25-33` - Auto-creates session if not exists
- `sessions-spawn.ts:54-65` - Creates child session before use
- `sessions-list.ts` - Handles empty list gracefully
- `sessions-history.ts:27` - Returns error if session not found

### ✅ Service Initialization is Robust

`src/services/factory.ts:117-130` properly initializes services in order:
1. Create service instances
2. Initialize memory
3. Initialize sessions
4. Initialize vector (optional)
5. Set global services

### ✅ Workspace Initialization is Safe

`src/config/workspace.ts` uses `skipIfExists` pattern to avoid overwriting user files.

---

## Recommendations

### Priority 1 (Fix Now)
1. Add session existence checks in `pi/runtime.ts` (compaction and announce)
2. Fix race condition in `file.ts` loadSession

### Priority 2 (Next Sprint)
3. Add better error context in CLI session creation
4. Standardize error message format across tools
5. Add retry logic for file operations

### Priority 3 (Future)
6. Add integration tests for session lifecycle edge cases
7. Add tests for concurrent session operations
8. Consider adding session TTL/cleanup for abandoned sessions

---

## Test Coverage Gaps

Missing test scenarios:
1. Session deleted during Pi agent runtime
2. Parent session deleted before subagent completes
3. Concurrent session creation with same key
4. File session service race conditions
5. Service initialization failure recovery
