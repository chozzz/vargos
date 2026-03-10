# Plan: Agent Definitions, Skills, Error System

## Overview

Five interconnected features to give Vargos structured multi-agent routing,
reusable skills, step-by-step planning, centralized error tracking, and
self-healing error review.

---

## 1. Centralized Error Store

Append-only JSONL at `~/.vargos/errors.jsonl`.

```typescript
interface ErrorEntry {
  ts: string;
  runId?: string;
  sessionKey?: string;
  tool?: string;
  errorClass: 'transient' | 'auth' | 'timeout' | 'rate_limit' | 'validation' | 'fatal';
  message: string;
  model?: string;
  resolved?: boolean;
}
```

**Hook points:** `runtime.ts` (run failures), tool `execute()` wrappers,
service reconnect failures. Single `appendError()` function — no new service.

**Heartbeat integration:** error-review agent writes findings to HEARTBEAT.md,
main agent picks them up on next poll.

---

## 2. Skills Directory

Location: `~/.vargos/workspace/skills/<name>/SKILL.md`

```yaml
---
name: code-review
description: Structured code review focusing on quality and patterns
tags: [code, review]
---
# Code Review

When reviewing code:
1. Read the changed files
2. Check for: naming, error handling, duplication, edge cases
3. Report findings with file:line references
```

**Three-phase lifecycle:**
1. **Discover** — scanner reads name + description at boot, builds manifest
   injected into system prompt as `## Available Skills`
2. **Activate** — `skill_load` tool reads full SKILL.md into context on demand
3. **Execute** — agent follows instructions using existing tools

Skills are prompt recipes, not code. The agent uses existing tools to execute.

**Agent-authored skills:** agents can create new skills via `fs_write` to
`~/.vargos/workspace/skills/<name>/SKILL.md`. The skill becomes available on
next boot (or via a `skill_reload` tool for immediate discovery). This lets
agents codify learned patterns into reusable skills autonomously.

---

## 3. Agent Definitions

Location: `~/.vargos/workspace/agents/<name>.md`

```yaml
---
name: security-auditor
description: Reviews code for security vulnerabilities
model: claude-sonnet       # optional model override
skills: [security-audit]   # skills this agent should use
---
# Security Auditor

You review code for security issues. Focus on:
- Auth flows and token handling
- Input validation and injection vectors
- Privilege escalation paths
```

**Integration with sessions_spawn:**
- `sessions_spawn({ agent: "security-auditor", task: "..." })` loads the
  agent definition as the role/backstory
- Skills listed in frontmatter are pre-loaded into the subagent's context
- Model override applied if specified

**Scanner:** reads name + description at boot → `## Available Agents` manifest
in system prompt. Full content loaded only when spawning.

---

## 4. Plan-and-Execute Prompting

Prompt-level enhancement to the orchestration section. No new runtime code.

```
When given a complex task:
1. Plan: List numbered steps. For each step, name the agent and skills.
2. Execute: Spawn agents per step (parallel where independent).
3. Review: Check results against plan. Replan if steps failed or are incomplete.
4. Synthesize: Combine results into a coherent response.
```

Agent definitions (#3) and skills (#2) give the planner concrete options to
reference. The existing `sessions_spawn` + subagent orchestration handles
execution.

---

## 5. Error Review Scheduler

Built-in cron task using existing infrastructure:

```json
{
  "name": "error-review",
  "schedule": "0 9 * * 1",
  "task": "Review errors from ~/.vargos/errors.jsonl (past 7 days). Group by pattern, suggest fixes, update HEARTBEAT.md with action items.",
  "notify": ["whatsapp:..."]
}
```

The error-review agent:
1. Reads recent entries from errors.jsonl
2. Groups by errorClass, tool, and recurring messages
3. Proposes fixes for patterns (>3 occurrences)
4. Writes action items to HEARTBEAT.md
5. Marks reviewed entries as resolved

---

## Implementation Order

| Phase | What | Effort | Dependencies |
|-------|------|--------|-------------|
| 1 | Error store (`appendError` + JSONL) | Small | None |
| 2 | Skills directory scanner + `skill_load` tool | Medium | None |
| 3 | Agent definitions scanner + spawn integration | Medium | Skills (#2) |
| 4 | Plan-and-execute prompt enhancement | Small | Agents + Skills |
| 5 | Error review cron + heartbeat integration | Small | Error store (#1) |

Phases 1 and 2 can run in parallel. Phase 3 builds on 2.
Phases 4 and 5 are prompt/config changes once the foundation exists.

---

## Key Design Decisions

- **Skills are Markdown, not code** — agents can author them via fs_write
- **Agent definitions reference skills** — skills array in frontmatter
- **Lazy loading** — only name+description at boot; full content on demand
- **No new services** — scanner runs at boot, tools use existing registry
- **Error store is append-only JSONL** — queryable by agents, no DB needed
- **Self-healing loop** — error store → cron review → HEARTBEAT.md → agent action
