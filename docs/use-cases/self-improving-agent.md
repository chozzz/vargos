# Use Case: Self-Improving Agent

## Summary

The agent monitors its own errors, identifies recurring failure patterns, and codifies learned workflows into reusable skills — all autonomously, without operator intervention.

## Error Review Loop

A built-in daily cron reads `~/.vargos/errors.jsonl`, groups errors by pattern, and writes action items to `HEARTBEAT.md`. On the next heartbeat poll, the agent reads those items and attempts fixes (updating prompts, adjusting config, flagging unresolvable issues).

```
errors.jsonl → error-review cron → HEARTBEAT.md → heartbeat agent → fix or escalate
```

Errors are auto-classified (`transient`, `auth`, `timeout`, `rate_limit`, `validation`, `fatal`) and API keys are stripped before storage.

## Skill Authoring

The agent can create new skills via the `write` tool:

```
Agent writes → ~/.vargos/workspace/skills/my-skill/SKILL.md
```

On the next run, the skill appears in the system prompt's skills manifest and is available to any agent. Skills are Markdown prompt recipes — no code — so the agent can author them naturally.

**Example:** After repeatedly researching Australian AI companies, the agent creates a `australia-tech-research` skill with the best search queries, sources, and synthesis format baked in.

## Heartbeat

A background cron (every 30 min) runs maintenance: checks workspace health, reviews HEARTBEAT.md for pending tasks, and prunes no-op responses. Skipped when idle (outside active hours, agent busy, HEARTBEAT.md empty).

## Notes

- Skill scanner runs at boot — new skills created mid-session appear on the next run
- Error store is append-only JSONL — queryable by the agent, no DB needed
- HEARTBEAT.md is the task queue (WHAT); AGENTS.md has permanent procedures (HOW)
- HEARTBEAT_OK responses (no-op heartbeats) are pruned immediately to keep cron sessions lean
