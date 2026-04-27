# Runtime

The agent runtime wraps the Pi SDK to execute LLM-powered agent sessions with tool access, streaming, and session management.

## Execution Flow

```
User message (WhatsApp / Telegram / Cron / Webhook)
  │
  ├─ ChannelsService.onInboundMessage() / cron.fire()
  │   ├─ Resolves config: model, thinking level, chat directives
  │   └─ Calls bus.call('agent.execute', { sessionKey, task, images })
  │
  ├─ AgentRuntime.execute()
  │   │
  │   ├─ 1. getOrCreateSession(sessionKey, cwd)
  │   │      Creates PiAgent session via SessionManager
  │   │      Custom tools loaded from bus @register handlers
  │   │      System prompt built from workspace bootstrap files
  │   │      Skills loaded from workspace/skills/
  │   │
  │   ├─ 2. session.prompt(task, { images })
  │   │      PiAgent calls LLM with tools available
  │   │      Streams deltas → lifecycle events → tool calls → response
  │   │
  │   └─ 3. extractResponse(session)
  │         Extracts last assistant message from session history
  │
  └─ Response returned to caller → delivered to channel/caller
```

## Pi SDK Prompt Ownership

Vargos owns the system prompt. The Pi SDK's `AgentSession` normally builds its own default prompt and resets to it on every `prompt()` call. We bypass this by:

1. Building our prompt before session creation from workspace files (CLAUDE.md, AGENTS.md, SOUL.md, TOOLS.md)
2. Passing it as `systemPrompt` to the `DefaultResourceLoader` (SDK uses it as `customPrompt` — pass-through mode)
3. Overriding `agentsFilesOverride` to return empty (prevents ancestor CLAUDE.md/AGENTS.md duplication)

This makes `_baseSystemPrompt` our prompt, so the SDK reset is a no-op.

## System Prompt

Built by `AgentRuntime.getSystemPrompt()`:

| Order | Section | Content |
|-------|---------|---------|
| 1 | Bootstrap files | CLAUDE.md → AGENTS.md → SOUL.md → TOOLS.md (6K char limit each) |
| 2 | Skills | Available skills manifest (name + description) |

Bootstrap files are loaded from `~/.vargos/` (the data directory). If a `cwd` is provided, files from both locations are merged (workspace first, then cwd).

## Skills

Reusable prompt recipes stored as `~/.vargos/workspace/skills/<name>/SKILL.md` with YAML frontmatter.

### Structure

```
~/.vargos/workspace/skills/
├── code-review/SKILL.md     frontmatter: name, description, tags
├── deep-research/SKILL.md   body: full instructions the agent follows
├── plan/SKILL.md
└── ...
```

### Lifecycle: Discover → Activate → Execute

```
1. DISCOVER — at session creation
   loadSkillsFromDir() reads frontmatter from each SKILL.md
   → manifest injected into system prompt under "## Available Skills"

2. ACTIVATE — agent uses skill
   Agent sees skill name + description in system prompt
   Follows instructions from the skill's SKILL.md body

3. EXECUTE — agent follows skill instructions
   No special runtime — skills are prompt injection.
   Agent uses existing tools (exec, read, write, web_fetch, etc.)
```

### Creating Skills

The agent can create new skills by writing a SKILL.md file:

```markdown
---
name: my-skill
description: One-line description shown in the manifest
tags: [category, tags]
---

# Instructions

Detailed instructions the agent follows when this skill is activated.
```

New skills appear in the manifest on the next run automatically.

## Streaming Events

The runtime subscribes to PiAgent events and re-emits them to the bus:

| PiAgent Event | Bus Event | Payload |
|---------------|-----------|---------|
| `message_update` | `agent.onDelta` | `{ sessionKey, chunk }` |
| `tool_execution_start` | `agent.onTool` | `{ sessionKey, toolName, phase: 'start', args }` |
| `tool_execution_end` | `agent.onTool` | `{ sessionKey, toolName, phase: 'end', result }` |
| `agent_end` / `turn_end` | `agent.onCompleted` | `{ sessionKey, success, response?, error? }` |

This enables real-time typing indicators, tool progress visibility, and run completion handling for channels and CLI clients.

## Model Registration

The runtime registers models with the Pi SDK dynamically:

- Providers configured in `config.providers` are registered with the `ModelRegistry`
- API keys resolved from env vars (`${PROVIDER}_API_KEY`) with fallback to config
- Custom base URLs supported (Ollama, LM Studio, OpenRouter)
- Local providers need a dummy `"local"` API key for Pi SDK auth
- Supported: `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio`, `groq`, `together`, `deepseek`, `mistral`, `fireworks`, `perplexity`

## Debug Mode

Enable with `AGENT_DEBUG=true`:

- Logs system prompt preview (first 30 lines)
- Lists all registered tools with parameters
- Logs PiAgent events (excluding `message_update`)
- Logs skills loaded from each directory

```bash
AGENT_DEBUG=true pnpm start
```

See [mcp.md](./mcp.md) for tool details, [sessions.md](./sessions.md) for session lifecycle.
