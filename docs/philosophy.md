# Philosophy

Design principles that guide Vargos development. Every PR and feature should be evaluated against these.

## 1. Token Budget is Sacred

The system prompt is injected into every single API call. Every character costs real money and displaces context the model needs for the actual task. Treat the system prompt like a production binary — measure it, profile it, optimize it.

**Rules:**
- The system prompt should stay under 4,000 characters for channel sessions (WhatsApp, Telegram).
- Tools are already declared in the API schema — don't re-describe them in the system prompt. Only list tools that need behavioral guidance (e.g., "use `exec` for shell commands").
- External tools (MCP servers) should be summarized by server name and count, not listed individually.
- Bootstrap files (AGENTS.md, SOUL.md, TOOLS.md) are the user's space — the system prompt builder should not duplicate what they already contain.
- If a section only applies to one mode (e.g., heartbeat guidance for cron), don't inject it in other modes.

## 2. The Model Already Knows

LLMs know how to use tools, write code, and follow instructions. The system prompt should tell the model what makes *this* agent different — not re-teach general capabilities.

**Don't:**
- List shell command examples (`git clone`, `npm install`) — the model knows these.
- Explain what tools do when the tool schema already has a description.
- Add instructions like "wait for results before proceeding" — that's how tool calling works.

**Do:**
- Define identity and personality (via SOUL.md).
- Set behavioral boundaries (what to do vs. ask first).
- Provide environment-specific context (workspace path, infrastructure).

## 3. Every Byte Earns Its Place

Before adding anything to the system prompt, codebase, or workspace files, ask: "Does this change the model's behavior in a measurable way?" If not, delete it.

**Applied to system prompt sections:**
- Identity: Yes — defines who the agent is. Keep.
- Tool list with "Available tool" descriptions: No — zero information. Remove.
- Shell & Git examples: No — the model already knows `git push`. Remove.
- Channel rules: Yes — changes how the agent responds in messaging. Keep.
- Heartbeat protocol in full mode: No — chat users never send heartbeats. Remove from full mode.

## 4. Separate Concerns Across Layers

The system prompt has layers. Each layer owns a specific concern. Don't mix them.

| Layer | Owns | Source |
|-------|------|--------|
| Identity | Who the agent is | SOUL.md |
| Rules | How the agent behaves | AGENTS.md |
| Environment | What's available | TOOLS.md, tool schemas |
| Context | What's happening now | Channel, session, system info |

If behavioral guidance creeps into TOOLS.md, or environment details into SOUL.md, refactor them back to their layer.

## 5. Fail Loud, Recover Quiet

Transient failures (network drops, API timeouts) should retry silently. Permanent failures (bad config, missing credentials) should fail immediately with clear errors.

**Applied to the agent runtime:**
- Network errors → retry (up to 2 attempts), log each attempt.
- Invalid API key → fail immediately, tell the user.
- Model returns empty → log it, skip delivery, don't crash.
- Never swallow errors silently — if nothing is logged, it didn't happen.

## 6. Workspace Files Are User Territory

Template files (`docs/templates/`) are copied once on first boot. After that, the agent and user own the workspace copies. The codebase should never silently overwrite them.

**Rules:**
- Templates are reference only — never assume they match what's live.
- The heartbeat maintains workspace files, not code deploys.
- If a template changes, the heartbeat will naturally evolve the live file over time.

## 7. Observe Everything, Log What Matters

The system should never appear "stuck" or "silent" when it's actually working. Every state transition should be visible in logs.

**Applied to the runtime:**
- Log when prompting the model.
- Log when tool execution starts and ends.
- Log when waiting for model response after tool results.
- Stream deltas to the event bus for live UIs.
- Don't log every token — log transitions.

## 8. The Gateway Is Dumb

The gateway routes frames. It knows nothing about agents, tools, channels, or sessions. This is the foundation of the architecture — protect it.

(See `docs/architecture.md` for the full set of architectural principles.)
