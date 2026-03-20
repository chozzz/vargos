# Runtime

The agent runtime wraps the Pi SDK to execute LLM-powered agent sessions with tool access, streaming, and session management.

## Execution Flow

```
User message (WhatsApp / CLI / Telegram / Cron / Webhook)
  │
  ├─ AgentService receives (via message.received or cron.trigger event)
  │   ├─ Resolves config: model, thinking level, chat directives
  │   ├─ Creates or reuses session
  │   └─ Enqueues to PiAgentRuntime (serialized per session)
  │
  ├─ PiAgentRuntime.executeRun()
  │   │
  │   ├─ 1. buildSystemPromptText(config)
  │   │      Assembles the system prompt (see System Prompt below)
  │   │
  │   ├─ 2. buildPiSession({ systemPrompt })
  │   │      Creates Pi SDK session with Vargos-owned prompt.
  │   │      SDK uses our prompt as _baseSystemPrompt (not its own default).
  │   │      Ancestor CLAUDE.md/AGENTS.md suppressed via agentsFilesOverride.
  │   │      Custom tools registered from the global tool registry.
  │   │
  │   ├─ 3. injectHistory(session)
  │   │      stored → converted → sanitized → token-pruned → turn-limited
  │   │
  │   └─ 4. session.prompt(task)
  │         LLM call with tools available via API tool schemas.
  │         SDK's emitBeforeAgentStart preserves our _baseSystemPrompt.
  │         Agent streams deltas → lifecycle events → tool calls → response.
  │
  └─ Response stored in session → delivered to channel/caller
```

### Pi SDK Prompt Ownership

Vargos owns the system prompt. The Pi SDK's `AgentSession` normally builds its own
default prompt (~40K) and resets to it on every `prompt()` call via `emitBeforeAgentStart`.
We bypass this by:

1. Building our prompt before session creation
2. Passing it as `systemPrompt` to the `DefaultResourceLoader` (SDK uses it as `customPrompt` — pass-through mode)
3. Overriding `agentsFilesOverride` to return empty (prevents ancestor CLAUDE.md/AGENTS.md duplication)

This makes `_baseSystemPrompt` our prompt, so the SDK reset is a no-op.

## System Prompt

Built in layers by `src/agent/prompt.ts`. Full mode (~13K chars):

| Order | Section | Content |
|-------|---------|---------|
| 1 | Identity | Delegates persona to SOUL.md |
| 2 | Tooling | Built-in tool count + MCP external tool descriptions |
| 3 | Workspace | Working directory path |
| 4 | Codebase | Explore-before-assuming guidance (skipped for channels) |
| 5 | Orchestration | When to delegate vs act directly |
| 6 | Memory Recall | How to use memory_search + memory_get |
| 7 | Heartbeats | Heartbeat polling protocol |
| 8 | Bootstrap | AGENTS.md, SOUL.md, TOOLS.md (6K char limit, 70/20 head/tail truncation) |
| 9 | Skills | Available skills manifest (name + description) |
| 10 | Agents | Available agents manifest (name + description + skills) |
| 11 | Tool Call Style | Suppress verbose narration |
| 12 | Channel | Channel-specific plain-text rules (if applicable) |
| 13 | System | Date/time, host, model, thinking mode |
| 14 | Additional Context | Extra system prompt if provided |
| 15 | Reminder | Sandwich echo of channel rules (recency bias) |

Built-in tool schemas are sent via the API tools field — only MCP external tools are listed in the prompt for server context. This avoids prompt bloat from duplicating schemas.

### Prompt Modes

| Mode | When | Sections Included |
|------|------|-------------------|
| `full` | Chat, channels | All sections |
| `minimal` | Cron tasks | Identity, Tooling, Workspace, Heartbeat, Bootstrap, System |
| `minimal-subagent` | Sub-agents | Identity, Tooling, Workspace, Orchestration (focused worker), Bootstrap, System |
| `none` | Custom prompts | "You are a helpful assistant." |

### Bootstrap Files

AGENTS.md → SOUL.md → TOOLS.md, injected in that order. Max 6,000 chars each (70/20 head/tail truncation). `MEMORY.md` and `HEARTBEAT.md` are not auto-injected. See [workspace-files.md](./workspace-files.md) for full file reference.

## Skills

Reusable prompt recipes stored as `~/.vargos/workspace/skills/<name>/SKILL.md` with YAML frontmatter.

### Structure

```
~/.vargos/workspace/skills/
├── code-review/SKILL.md     frontmatter: name, description, tags
├── deep-research/SKILL.md   body: full instructions the agent follows
├── plan/SKILL.md
├── research/SKILL.md
└── ...
```

### Lifecycle: Discover → Activate → Execute

```
1. DISCOVER — at prompt build time
   scanSkills() reads frontmatter from each SKILL.md
   → manifest injected into system prompt under "## Available Skills"
   Agent sees: skill name + one-line description + tags

2. ACTIVATE — agent calls skill_load tool
   skill_load("plan") → reads full SKILL.md content into context
   Two-turn cost: agent sees manifest, then loads what it needs

3. EXECUTE — agent follows skill instructions
   No special runtime — skills are prompt injection.
   Agent uses existing tools (exec, read, write, web_fetch, etc.)
   to carry out the skill's instructions.
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

New skills appear in the manifest on the next run automatically. Scanner: `src/lib/skills.ts`.

## Agent Definitions

Lightweight routing aliases that bundle skills for sub-agent delegation.

### Structure

```
~/.vargos/workspace/agents/
├── code-reviewer.md     frontmatter only — no body
├── error-analyst.md     skills are the single source of behavior
└── researcher.md
```

```yaml
---
name: code-reviewer
description: Reviews code for quality, patterns, and correctness
skills: [code-review, simplify]
model: gpt-4o-mini              # optional: override model for this agent
---
```

### Activation via sessions_spawn

```
sessions_spawn({ agent: "code-reviewer", task: "Review auth module" })
  │
  ├─ loadAgent("code-reviewer")
  │   → { name, description, skills: ["code-review", "simplify"], model? }
  │
  ├─ Load each skill
  │   loadSkill("code-review") → full SKILL.md content
  │   loadSkill("simplify")    → full SKILL.md content
  │
  ├─ Concatenate skill contents as bootstrapOverrides['SOUL.md']
  │   (replaces the sub-agent's SOUL.md with skill instructions)
  │
  ├─ Create child session: <parent>:subagent:<timestamp>-<rand>
  │
  └─ Fire agent.run in background
      ├─ mode = minimal-subagent
      ├─ SOUL.md = concatenated skill content
      ├─ AGENTS.md + TOOLS.md = inherited from workspace
      └─ All tools available
```

### Agent vs Role

`sessions_spawn` supports two delegation modes:

| Parameter | Source | Use Case |
|-----------|--------|----------|
| `agent: "name"` | Agent definition file | Repeatable specialist with defined skills |
| `role: "You are a..."` | Inline string | Ad-hoc persona for one-off tasks |

If both are set, `agent` takes precedence. The `role` string replaces SOUL.md directly.

## Subagents

### Lifecycle

```
Parent agent calls sessions_spawn
  │
  ├─ Depth + breadth limits enforced
  │   maxSpawnDepth (default 3), maxChildren (default 10)
  │
  ├─ Child session created (kind: subagent)
  ├─ Task added as user message
  ├─ agent.run fired in background (fire-and-forget)
  │
  ├─ Child executes independently
  │   Uses tools, follows skill instructions
  │   Timeout enforced: runTimeoutSeconds (default 300)
  │
  ├─ On completion:
  │   Result announced to parent as system message
  │   metadata.type = 'subagent_announce'
  │
  ├─ Parent re-triggered (debounced 3s)
  │   toAgentMessages injects announce as user message
  │   Parent sees: "[Subagent Complete] session=... status=success duration=5.2s\n<result>"
  │
  └─ Parent synthesizes results → delivers to user
```

### Cron/Webhook Subagents

When a cron or webhook session spawns subagents, re-trigger results are routed to `notify` targets stored in session metadata — not to the cron channel (which has no adapter).

### Configuration

```jsonc
{
  "agent": {
    "subagents": {
      "maxChildren": 10,        // max active children per parent
      "maxSpawnDepth": 3,       // max nesting depth
      "runTimeoutSeconds": 300, // per-subagent timeout
      "model": "gpt-4o-mini"   // optional cheaper model for workers
    }
  }
}
```

## Streaming Events

The lifecycle emits typed events during execution:

| Event Type | Payload | Description |
|------------|---------|-------------|
| `lifecycle` | `{ phase, runId, sessionKey, tokens?, duration? }` | Run start/end/error/abort |
| `assistant` | `{ runId, delta }` | Text streaming delta |
| `tool` | `{ runId, name, args?, result? }` | Tool execution start/end |
| `compaction` | `{ runId, tokensBefore, summary }` | Context auto-compaction |

Lifecycle phases: `start` → `end` | `error` | `abort`.

## Message Queue

Messages are serialized per session via `SessionMessageQueue`:

- One agent run per session at a time
- Concurrent messages queued and processed in order
- Each enqueue returns a promise that resolves when processed
- Queue can be cleared (rejects pending messages)

## Model Registration

The runtime registers models with the Pi SDK dynamically:

- Custom providers (OpenRouter, Groq, Together, etc.) register with `openai-completions` API
- Local providers (Ollama, LM Studio) need a dummy `"local"` API key
- Supported: `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio`, `groq`, `together`, `deepseek`, `mistral`, `fireworks`, `perplexity`

## Thinking-Only Responses

When the model returns only thinking tokens (no text content), the runtime treats it as an empty response. For cron/webhook sessions, it retries once with a re-prompt. For channels, it skips delivery silently.

See [mcp.md](./mcp.md) for tool details, [sessions.md](./sessions.md) for session lifecycle, [architecture.md](./architecture.md) for protocol spec.
