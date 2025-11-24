# Agent Architecture

Vargos agent runtime with OpenClaw-style features:
- **Message Queue**: Per-session serialization
- **Lifecycle Events**: Streaming start/end/error
- **Bootstrap Injection**: System prompt with context files

## Overview

```
┌─────────────────────────────────────────────────────────┐
│  Incoming Message                                        │
│  (CLI, MCP, WhatsApp, etc.)                             │
├─────────────────────────────────────────────────────────┤
│  Session Message Queue                                   │
│  • One run at a time per session                        │
│  • Prevents race conditions                             │
├─────────────────────────────────────────────────────────┤
│  Agent Lifecycle                                         │
│  • Emits start/end/error events                         │
│  • Streams assistant/tool events                        │
├─────────────────────────────────────────────────────────┤
│  Pi SDK Runtime                                          │
│  • Build system prompt (bootstrap injection)            │
│  • Run agent with compaction handling                   │
│  • Store results to Vargos session                      │
└─────────────────────────────────────────────────────────┘
```

## Message Queue

Per-session serialization ensures only one agent runs at a time for each session:

```typescript
import { getSessionMessageQueue } from './agent/queue.js';

const queue = getSessionMessageQueue();

// Queue a message - waits if another run is active for this session
const result = await queue.enqueue(
  'cli:main',           // sessionKey
  'Hello!',             // content
  'user',               // role
  { type: 'task' }      // metadata
);
```

**Queue Modes** (not yet implemented):
- `collect`: Hold messages until current turn ends
- `steer`: Cancel current tool calls, inject new message
- `followup`: Queue for next turn after current completes

## Lifecycle Events

Stream events during agent runs:

```typescript
import { getAgentLifecycle, type AgentStreamEvent } from './agent/lifecycle.js';

const lifecycle = getAgentLifecycle();

// Subscribe to all stream events
lifecycle.onStream((event: AgentStreamEvent) => {
  switch (event.type) {
    case 'lifecycle':
      console.log(`Run ${event.phase}: ${event.runId}`);
      break;
    case 'assistant':
      process.stdout.write(event.content);
      break;
    case 'tool':
      console.log(`Tool ${event.toolName} ${event.phase}`);
      break;
    case 'compaction':
      console.log(`Context compacted: ${event.tokensBefore} tokens`);
      break;
  }
});
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `lifecycle` | Run start, end, error, abort |
| `assistant` | Streaming assistant content |
| `tool` | Tool start/end |
| `compaction` | Context compaction |

## System Prompt

OpenClaw-style prompt with bootstrap file injection:

```typescript
import { buildSystemPrompt } from './agent/prompt.js';

const prompt = await buildSystemPrompt({
  mode: 'full',              // 'full' | 'minimal' | 'none'
  workspaceDir: './workspace',
  toolNames: ['read', 'write', 'exec'],
  userTimezone: 'Australia/Sydney',
  model: 'gpt-4o',
  thinking: 'low',
});
```

**Prompt Modes:**

| Mode | Description | Use For |
|------|-------------|---------|
| `full` | All sections + bootstrap files | Main sessions |
| `minimal` | Tooling, workspace, runtime only | Subagents |
| `none` | Single line identity | Testing |

**Injected Bootstrap Files:**
- `AGENTS.md` - Workspace rules
- `SOUL.md` - Agent persona
- `TOOLS.md` - Local tool notes
- `IDENTITY.md` - Agent identity
- `USER.md` - User profile
- `HEARTBEAT.md` - Periodic tasks
- `BOOTSTRAP.md` - First-run ritual (only on first run)

## PiAgentRuntime

Main runtime with all features integrated:

```typescript
import { getPiAgentRuntime } from './pi/runtime.js';

const runtime = getPiAgentRuntime();

// Subscribe to events
runtime.onStream((event) => {
  // Handle streaming events
});

// Run agent (queued automatically)
const result = await runtime.run({
  sessionKey: 'cli:main',
  sessionFile: '~/.vargos/sessions/cli-main.jsonl',
  workspaceDir: './workspace',
  model: 'gpt-4o',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  userTimezone: 'Australia/Sydney',
});

console.log(result.response);
console.log(`Duration: ${result.duration}ms`);
console.log(`Tokens: ${result.tokensUsed?.total}`);
```

## E2E Flow Example

```typescript
// 1. WhatsApp message arrives
const message = { from: '+123456', text: 'Hello!' };

// 2. Resolve session key
const sessionKey = 'agent:main:whatsapp:dm:+123456';

// 3. Add message to session
await sessions.addMessage({
  sessionKey,
  content: message.text,
  role: 'user',
  metadata: { from: message.from },
});

// 4. Queue and run agent
const runtime = getPiAgentRuntime();
const result = await runtime.run({
  sessionKey,
  sessionFile: path.join(os.homedir(), '.vargos', 'sessions', `${sessionKey.replace(/:/g, '-')}.jsonl`),
  workspaceDir: './workspace',
  model: 'gpt-4o',
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

// 5. Send response back
await whatsapp.send({ to: message.from, text: result.response! });
```

## File Structure

```
src/agent/
├── index.ts        # Module exports
├── prompt.ts       # System prompt builder
├── queue.ts        # Message queue
└── lifecycle.ts    # Lifecycle events

src/pi/
├── runtime.ts      # Pi SDK integration
└── index.ts        # Pi module exports
```

## Configuration

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `VARGOS_WORKSPACE` | Default workspace directory |
| `VARGOS_SESSIONS_DIR` | Sessions storage path |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GOOGLE_API_KEY` | Google API key |

**CLI Options:**

```bash
# Chat with persistent session
pnpm cli chat -m gpt-4o -p openai --session main

# Run single task
pnpm cli run "Analyze codebase" -m claude-3.5 -p anthropic
```

## Next Steps

See also:
- [OpenClaw Agent Loop](/usr/lib/node_modules/openclaw/docs/concepts/agent-loop.md)
- [OpenClaw Sessions](/usr/lib/node_modules/openclaw/docs/concepts/session.md)
- [OpenClaw System Prompt](/usr/lib/node_modules/openclaw/docs/concepts/system-prompt.md)
