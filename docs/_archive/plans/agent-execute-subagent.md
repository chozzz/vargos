# Agent.Execute & Subagent Architecture

**Status**: Partially fixed (April 2026)  
**Issue**: Agent doesn't know its own sessionKey when agent.execute exposed as tool  
**Related**: Channel fire-and-forget reply pattern

## Problem Statement

When agents spawn subagents via `agent.execute` tool, two architectural issues arise:

### Issue 1: Subagent SessionKey Injection
- `agent.execute` requires `sessionKey` parameter (identifies which session spawns the subagent)
- Agent has **no awareness** of its own sessionKey — it's execution metadata, not visible to agent code
- Agent can't intelligently construct subagent sessionKey (should be `parent:subagent`)
- Current workaround: Auto-append `:subagent` if agent omits sessionKey, but agent might explicitly try to pass it (which fails)

**Current code location**: `services/agent/tools.ts:48-50` (auto-injection logic)

### Issue 2: Fire-and-Forget Reply Pattern
- Channels call `bus.call('agent.execute', params)` fire-and-forget
- Agent finishes → emits `agent.onCompleted` event
- Channel listens on `agent.onCompleted` → calls `channel.send` to deliver reply
- **Problems**:
  - Implicit/magical: agent doesn't know it's supposed to reply to a channel
  - Error-prone: async errors in chain can be silent
  - Not in agent's control: agent can't decide when/what to send

**Current code locations**:
- Fire-and-forget call: `services/channels/index.ts:262`
- Event handler: `services/channels/index.ts:184-208`

## Current State (April 16, 2026)

**FIXED**: 
- ✅ Subagent sessionKey auto-injection for omitted cases (added :subagent suffix)
- ✅ Await `channel.send` in `agent.onCompleted` handler
- ✅ Catch async errors in agent.execute with `.catch()` handler

**NOT FIXED** (still blocking agent spawning):
- ⚠️ Agent receives raw `agent.execute` tool with sessionKey parameter
- ⚠️ Agent doesn't know this parameter represents parent sessionKey
- ⚠️ No context injection about which channel agent is operating in
- ⚠️ Fire-and-forget pattern still implicit

## Solution Options

### Option A: Remove sessionKey from agent.execute tool schema
**Approach**: 
- Modify `wrapEventAsToolDefinition()` to strip sessionKey from agent.execute schema
- Always auto-inject parent sessionKey in tool wrapper
- Agent never sees or needs to fill sessionKey

**Pros**:
- Foolproof — agent can't pass wrong sessionKey
- No agent education needed
- Keeps agent unaware of channel/session metadata

**Cons**:
- Tool signature doesn't match actual agent.execute schema
- Other tools might benefit from same pattern (which ones?)

**Implementation**: `services/agent/tools.ts:22-77`

### Option B: channel.sendToLastActiveChannel tool
**Approach**:
- Create new tool `channel.sendToLastActiveChannel(text: string)`
- Agent explicitly calls tool to send replies (like any other task)
- Requires prompt to educate agent: "After solving task, send result to active channel"
- Remove implicit agent.onCompleted reply pattern

**Pros**:
- Explicit: agent controls reply flow
- Channel inference: system tracks which channel was last active
- Fits agent's mental model: "call a tool to send message"

**Cons**:
- Requires prompt changes (bootstrap files AGENTS.md or TOOLS.md)
- Extra tool call in agent flow
- Need to define "last active channel" (WhatsApp vs Telegram precedence?)

**Implementation**: 
- New callable: `services/channels/index.ts` (new handler)
- Tool tracking: likely needs channel metadata in agent context

### Option C: Context injection in system prompt
**Approach**:
- Inject `sessionKey` and `channelType` into system prompt prefix
- Agent can reference: "I'm operating in session {sessionKey}, channel is {channelType}"
- Lets agent construct subagent sessionKey properly

**Pros**:
- Agent is aware of context
- Flexible — agent can make informed decisions
- Works with existing tools

**Cons**:
- Verbose system prompt additions
- Agent might misuse/leak sessionKey
- Still doesn't solve fire-and-forget pattern

**Implementation**: `services/agent/index.ts:306-341` (getSystemPrompt method)

## Related: Bootstrap Files Missing

**Currently**: System prompt loads from `~/.vargos/{CLAUDE,AGENTS,SOUL,TOOLS}.md` but these don't exist  
**Impact**: Agent uses PiAgent defaults only, no vargos-specific guidance  
**Needed for Options B & C**: Create `AGENTS.md` to guide agent on subagent spawning and reply patterns

Suggested `AGENTS.md` content:
```markdown
# Agent Instructions

## Spawning Subagents
When a task is complex, you can spawn a subagent:
- Call tool `agent.execute` with just the task (subagent sessionKey handled automatically)
- Subagent operates in same session with `:subagent` suffix

## Sending Replies to Channels
After solving task:
- Call `channel.sendToLastActiveChannel` with result text
- This sends to the channel that asked the question
```

## Next Steps

**Decision point**: Choose Option A, B, or C (or hybrid)

1. **Option A** (recommended for now):
   - Strip sessionKey from agent.execute tool schema
   - Update tool wrapper logic
   - Test: agent can spawn subagents without sessionKey param
   - Files: `services/agent/tools.ts`

2. **Option B** (better long-term):
   - Create bootstrap file `~/.vargos/AGENTS.md`
   - Implement `channel.sendToLastActiveChannel` tool
   - Remove agent.onCompleted reply pattern
   - Update channels service to track last-active-channel-per-user
   - Files: `services/channels/index.ts`, bootstrap files

3. **Option C** (context-aware):
   - Create bootstrap file `~/.vargos/AGENTS.md`
   - Inject sessionKey into system prompt
   - Let agent handle subagent sessionKey construction
   - Files: `services/agent/index.ts`, bootstrap files

## Testing Strategy

**Current test**: `services/channels/__tests__/e2e/channels.e2e.test.ts`
- Tests full inbound → agent → reply flow
- Should validate subagent spawning works without sessionKey param

**New tests needed** (whichever option chosen):
- Subagent receives parent sessionKey correctly
- Fire-and-forget reply pattern doesn't lose errors
- Channel identifies correct recipient for replies

## Session Context

- **WhatsApp last interaction**: Apr 15, 01:17:34 UTC — agent got stuck in data-gathering loop
- **Root cause**: Agent never called agent.execute to spawn subagent; just accumulated Jira/file data
- **Why**: Agent didn't know HOW to call agent.execute (sessionKey mystery)
- **Fix validation**: After implementation, test WhatsApp cramclass-platform task should complete with summary

