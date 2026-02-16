# CLI UX Improvements (Deferred)

Captured from CLI audit on 2026-02-16. Critical/High items are being handled separately.

## Medium Priority

- [ ] **No channel edit-in-place** — `cli/config/channel.ts:28-41` only offers setup wizard, no way to toggle enabled/edit allowFrom/update botToken without re-running full setup or editing JSON
- [ ] **Error messages lack recovery hints** — `chat.ts:27`, `run.ts:19` show generic errors without suggesting `vargos health`
- [ ] **Chat Ctrl+C cleanup unpredictable** — `chat.ts:34-37` readline close event doesn't guarantee `client.disconnect()`
- [ ] **Config show after edit doesn't display diff** — `cli/config/llm.ts:81` just says "Config saved" without showing what changed
- [ ] **No confirmation before destructive ops** — `stop.ts:12` kills gateway immediately, `llm.ts:80` overwrites config without "Save changes?"
- [ ] **Editor fallback is `vi`** — `cli/config/context.ts:33` should check if editor exists, prefer nano
- [ ] **Channel show doesn't show connection status** — `cli/config/channel.ts:9-26` only shows enabled/disabled, not online/offline

## Low Priority

- [ ] **No `--json` output flag** for scripting (`cli/index.ts`)
- [ ] **No `--quiet` flag** to suppress banners in automation
- [ ] **No fuzzy "did you mean?"** on unknown commands (`cli/index.ts:50-54`)
- [ ] **Menu lacks breadcrumb navigation** — user loses sense of location in deep menus
- [ ] **No section dividers** in gateway startup output (`start.ts:265-272`)
- [ ] **Status command too minimal** — `status.ts:4-11` only checks PID, no uptime/health
- [ ] **No `NO_COLOR` env var support** — `banner.ts:45` uses hardcoded hex colors
- [ ] **Help text alignment** — `cli/index.ts:10-21` command hints don't align well for deep nesting
- [ ] **No dry-run mode** for config edits
- [ ] **Exit codes inconsistent** — mix of `process.exit(1)` and thrown errors
