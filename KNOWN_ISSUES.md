# Known Issues

## Subagent Completion Storm

**Status:** Open — not yet fixed

**Affected:** Cron tasks with `notify` targets, research runs with multiple subagents

### Symptoms

When a session spawns multiple subagents (common in cron tasks and research runs), the parent agent sends 10–25 consecutive messages to the channel with no user input between them. Each message independently declares the task complete and re-synthesizes the result.

Also affects cron notify deliveries — multiple WhatsApp messages sent per cron run instead of one consolidated report.

### Root Cause

`handleSubagentCompletion` re-triggers the parent agent (debounced 3s) each time a subagent announces completion. When subagents complete at staggered intervals (e.g. t=0s, t=5s, t=12s), each wave produces a separate re-trigger. The 3s debounce only helps when completions cluster tightly.

The parent agent has no "I already synthesized" flag. Each re-trigger sees new `subagent_announce` messages and produces a fresh synthesis response, which is then delivered to the channel.

For cron tasks with `notify` targets, the notify delivery fires on *every* `run.completed` event — including intermediate ones caused by re-triggers — so the notify target receives one message per re-trigger wave.

### Proposed Fix

Track expected vs. received subagent count in session metadata:

1. `sessions_spawn` increments a `pendingSubagents` counter
2. Each `subagent_announce` decrements it
3. Re-trigger only fires when `pendingSubagents === 0`
4. Notify delivery only fires when the re-trigger run is the final one

**Affected files:** `services/sessions/index.ts` (spawn counter), `services/agent/index.ts` (handleSubagentCompletion, notify delivery)

### Workaround

Reduce subagent count in prompts to minimize storm frequency.
