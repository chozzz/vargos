# Bug: Subagent Completion Storm

## Status
Open — not yet fixed.

## Symptoms

When a session spawns multiple subagents (common in cron tasks and research runs), the parent agent sends 10–25 consecutive messages to the channel with no user input between them. Each message independently declares the task complete and re-synthesizes the result.

Observed in WhatsApp session `whatsapp:61423222658` on 2026-03-13, 2026-03-14, 2026-03-15, 2026-03-16, 2026-03-17. Also observed in cron notify deliveries — multiple WhatsApp messages sent per cron run instead of one.

## Root Cause

`handleSubagentCompletion` re-triggers the parent agent (debounced 3s) each time a subagent announces completion. When subagents complete at staggered intervals (e.g. t=0s, t=5s, t=12s), each wave produces a separate re-trigger. The 3s debounce only helps when completions cluster tightly.

The parent agent has no "I already synthesized" flag. Each re-trigger sees new `subagent_announce` messages and produces a fresh synthesis response, which is then delivered to the channel.

For cron tasks with `notify` targets, the notify delivery fires on *every* `run.completed` event — including intermediate ones caused by re-triggers — so the notify target receives one message per re-trigger wave.

## Proposed Fix

Track expected vs. received subagent count in session metadata. `sessions_spawn` increments a `pendingSubagents` counter; each `subagent_announce` decrements it. Re-trigger only fires when `pendingSubagents === 0`, and notify delivery only fires when the re-trigger run is the final one.

**Affected files:** `src/sessions/service.ts` (spawn counter), `src/agent/service.ts` (handleSubagentCompletion, notify delivery).

## Workaround

None. Reduce subagent count in prompts to minimize storm frequency.
