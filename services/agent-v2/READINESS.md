# Agent v2 Readiness Evaluation

## Goal: Send prompts through bus `agent.execute` from channels

---

## ✅ What's Implemented

### 1. **Bus RPC Handler** (`agent.execute`)
- ✅ `@register('agent.execute')` decorator
- ✅ Schema validation (sessionKey, task, thinkingLevel, model, cwd)
- ✅ Returns `{ response: string }`
- ✅ Directive parsing (`/think:high`, `/verbose`)

### 2. **PiAgent Integration**
- ✅ Session persistence via `SessionManager`
- ✅ Model registration via `ModelRegistry`
- ✅ API key management via `AuthStorage`
- ✅ Settings sync via `SettingsManager`
- ✅ Skills loading via `loadSkillsFromDir`
- ✅ Custom tools via `createCustomTools` (bus events → PiAgent tools)

### 3. **Session Management**
- ✅ `getOrCreateSession()` - lazy session creation
- ✅ Session caching in memory
- ✅ Session directory: `~/.vargos/sessions/<sessionKey>/`
- ✅ PiAgent automatically persists to disk

### 4. **System Prompt**
- ✅ `getSystemPrompt()` - loads workspace files
- ✅ AGENTS.md, SOUL.md, TOOLS.md support
- ✅ 6000 char truncation per file (70/20 head/tail)
- ✅ Returns undefined if no files (uses PiAgent default)

### 5. **Debug Mode** (`AGENT_DEBUG=true`)
- ✅ `logSystemPrompt()` - logs prompt preview
- ✅ `logTools()` - logs all registered tools
- ✅ `logSessionState()` - logs entries count, last entry
- ✅ `onSessionCreated()` - logs history on create
- ✅ `subscribeDebugLogging()` - logs all events

### 6. **Tools Integration**
- ✅ `createCustomTools()` - bus events → PiAgent ToolDefinitions
- ✅ Filters via `isToolEvent()` (has @register + description + schema)
- ✅ Executes via `bus.call()`
- ✅ Large result warnings (>5000 tokens)
- ✅ Error handling with `appendError()`

---

## ❌ What's Missing

### 1. **Channel Message Handler** (CRITICAL)
```typescript
// MISSING: No @on('channel.onInbound') handler
@on('channel.onInbound')
onChannelInbound(payload: EventMap['channel.onInbound']): void {
  // This is what channels emit when they receive a message
  // Agent v2 needs to subscribe to this and call execute()
}
```

**Impact:** Channels emit `channel.onInbound` but agent-v2 doesn't listen to it.

**Fix needed:**
```typescript
@on('channel.onInbound')
async onChannelInbound(payload: EventMap['channel.onInbound']): Promise<void> {
  const { channel, userId, sessionKey, content, metadata } = payload;
  
  // 1. Handle media if present (images, audio)
  // 2. Parse directives from content
  // 3. Call execute({ sessionKey, task: content, ... })
  // 4. Send response back via channel.send
}
```

### 2. **Response Delivery** (CRITICAL)
```typescript
// MISSING: No deliverToChannel() method
private async deliverToChannel(
  channel: string,
  userId: string,
  response: string,
): Promise<void> {
  const sessionKey = `${channel}:${userId}`;
  await this.bus.call('channel.send', { sessionKey, text: response });
}
```

**Impact:** Even if execute works, responses won't be sent back to users.

### 3. **Media Handling** (MEDIUM)
```typescript
// MISSING: No preprocessMedia() method
// Old agent had:
// - Audio transcription (whisper)
// - Image description (vision models)
// - Media transform storage
```

**Impact:** Media messages (voice, images) won't be processed.

### 4. **Subagent Orchestration** (MEDIUM)
```typescript
// MISSING: No agent.spawn handler
// Old agent had:
// - spawn() → create child session
// - handleSubagentCompletion() → re-trigger parent
// - announceToParent() → add system message
// - triggerParentRun() → continue parent after children
```

**Impact:** Can't delegate tasks to subagents.

### 5. **History Injection** (LOW)
```typescript
// PARTIAL: onSessionCreated() exists but doesn't inject history
// Old agent loaded stored messages and converted to PiAgent format
```

**Impact:** New sessions start fresh, no conversation history.

### 6. **Streaming Events** (LOW)
```typescript
// MISSING: No agent.onDelta, agent.onTool, agent.onCompleted emission
// Old agent emitted these for real-time UI updates
```

**Impact:** Channels can't show typing indicators or streaming responses.

---

## 🔧 Critical Path to MVP

### Step 1: Add Channel Handler (15 min)
```typescript
@on('channel.onInbound')
async onChannelInbound(payload: EventMap['channel.onInbound']): Promise<void> {
  const { sessionKey, content } = payload;
  
  try {
    const result = await this.execute({ sessionKey, task: content });
    
    // Send response back
    await this.bus.call('channel.send', {
      sessionKey,
      text: result.response,
    });
  } catch (err) {
    // Send error
    await this.bus.call('channel.send', {
      sessionKey,
      text: `Error: ${toMessage(err)}`,
    });
  }
}
```

### Step 2: Add Response Delivery (5 min)
- Extract `deliverToChannel()` helper
- Handle heartbeat token stripping
- Error handling with `appendError()`

### Step 3: Test End-to-End (30 min)
1. Start vargos: `pnpm start`
2. Send Telegram message
3. Check logs for `AGENT_DEBUG` output
4. Verify response received

---

## 📊 Readiness Score

| Category | Status | Score |
|----------|--------|-------|
| **Bus RPC** | ✅ Complete | 10/10 |
| **PiAgent Integration** | ✅ Complete | 10/10 |
| **Session Management** | ✅ Complete | 10/10 |
| **System Prompt** | ✅ Complete | 10/10 |
| **Tools** | ✅ Complete | 10/10 |
| **Debug Mode** | ✅ Complete | 10/10 |
| **Channel Handler** | ❌ Missing | 0/10 |
| **Response Delivery** | ❌ Missing | 0/10 |
| **Media Handling** | ❌ Missing | 0/10 |
| **Subagents** | ❌ Missing | 0/10 |
| **History Injection** | ⚠️ Partial | 5/10 |
| **Streaming Events** | ❌ Missing | 0/10 |

**Overall MVP Readiness: 60/120 (50%)**

**Critical Path (Channel + Delivery): 80/120 (67%)**

---

## 🚀 Recommendation

**For MVP (send prompts from channels):**

1. **Add `@on('channel.onInbound')` handler** - 15 min
2. **Add `deliverToChannel()` helper** - 5 min
3. **Test with a channel** - 30 min

**Total: ~1 hour to MVP**

**Post-MVP (nice to have):**
- Media handling (audio/images)
- Subagent orchestration
- History injection
- Streaming events

---

## 📝 Files to Modify

### `services/agent-v2/index.ts`
Add:
```typescript
@on('channel.onInbound')
async onChannelInbound(payload: EventMap['channel.onInbound']): Promise<void> {
  // Handle inbound channel message
}

private async deliverToChannel(
  channel: string,
  userId: string,
  response: string,
): Promise<void> {
  // Send response via channel.send
}
```

### `services/agent-v2/schema.ts`
No changes needed (already has `AgentDeps`)

### `services/agent-v2/tools.ts`
No changes needed (already complete)

---

## ✅ Checklist for MVP

- [ ] Add `@on('channel.onInbound')` handler
- [ ] Add `deliverToChannel()` method
- [ ] Import `toMessage` from `../../lib/error.js`
- [ ] Test with Telegram or WhatsApp channel
- [ ] Verify debug logs show:
  - System prompt loaded
  - Tools registered
  - Session created
  - Response sent
