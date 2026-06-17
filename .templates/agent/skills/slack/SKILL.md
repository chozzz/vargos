---
name: slack
description: Interact with Slack via the Web API using the user's token. Use when the user asks to list, search, read, send, react to, or export Slack messages, channels, DMs, group DMs, threads, or users. Supports browser-session tokens (xoxc with d cookie) and user/bot tokens (xoxp/xoxb).
---

# Slack

This skill ships with `slack.py` — a single-file Python CLI that wraps Slack's Web API. All commands print JSON to stdout for easy parsing.

## Setup (one time)

Credentials live in `~/.config/slack-skill/credentials.json` (chmod 600) as a **multi-profile** store, so the user can have one set of saved creds per workspace (work / personal / side project). Shape:

```json
{
  "default": "work",
  "profiles": {
    "work":     {"token": "xoxc-…", "cookie": "…", "team": "acme",   "team_id": "T01…"},
    "personal": {"token": "xoxp-…",                "team": "myteam", "team_id": "T02…"}
  }
}
```

Resolution order:
1. `$SLACK_TOKEN` (+ optional `$SLACK_COOKIE`) — bypasses profiles entirely.
2. The profile named by `--profile NAME` → `$SLACK_PROFILE` → the `default` key.

If the user has not stored credentials yet, ask them to run:

```
python3 ~/.claude/skills/slack/slack.py auth
```

It prompts for the token and — if the token starts with `xoxc-` — the `d` cookie value (just the value, no `d=` prefix), verifies via `auth.test`, then asks for a profile name (default: a slug derived from the team name). The first profile is auto-promoted to default.

**Token sources:**
- `xoxc-...` — browser session. Find it via DevTools in the Slack web client; the `d` cookie comes from Application → Cookies → `slack.com`. Required together.
- `xoxp-...` — user token from a Slack app install.
- `xoxb-...` — bot token from a Slack app install. Bot tokens cannot use `search.messages`.

## Subcommands

All accept `--help`. Channels can be passed as `#name`, `@user`, or a raw ID (`C…`, `D…`, `G…`, `U…`). User IDs auto-open a DM.

The top-level `--profile NAME` flag (before the subcommand) picks which credentials to use, e.g. `slack.py --profile personal history #standup`.

| Command | Purpose |
|---|---|
| `auth [--name N] [--make-default]` | Save credentials under a profile (verify first). |
| `list-profiles` | Show all saved profiles and the current default. |
| `use-profile NAME` | Change the default profile. |
| `remove-profile NAME` | Delete a profile. |
| `whoami` | Print `auth.test` result for the active profile. |
| `list-channels [--type all\|public\|private\|im\|mpim] [--search Q]` | List conversations. IMs are resolved to `@username`. |
| `list-users [--search Q]` | List non-deleted workspace users. |
| `history <channel> [--limit N] [--oldest TS] [--latest TS] [--with-threads]` | Read messages. Paginates automatically. |
| `thread <channel> <ts>` | Read replies in a thread. |
| `send <channel> <text> [--thread TS]` | Post a message (or thread reply). |
| `react <channel> <ts> <emoji>` | Add a reaction. |
| `search <query> [--limit N] [--sort timestamp\|score]` | Slack search syntax. User token only. |
| `info <channel>` | `conversations.info`. |
| `export <channel> [--output DIR] [--with-threads]` | Dump full history + threads to `<dir>/messages.json` and `<dir>/channel.json`. |
| `menu` | Interactive prompt-driven mode for the user to run manually. |

## How to invoke from Claude

- Prefer specific subcommands over `menu` (which expects an interactive terminal).
- Always confirm with the user before `send`, `react`, or any write operation. Read-only ops (list/history/search/info/export) can run without prior confirmation.
- If the user has multiple profiles (check `list-profiles`) and the request is workspace-specific, confirm which profile to use — or pass `--profile NAME` explicitly. Don't assume the default is the right one.
- For exports of large channels, pass `--with-threads` unless the user opts out — replies live on separate endpoints.
- Resolve a channel/user once with `list-channels` or `list-users` and reuse the ID for follow-up calls.
- Pipe output through `jq` if you need to extract a single field; the script already pretty-prints JSON.

Example flow when the user asks "export my DM with Alice":
1. `list-channels --type im --search alice` → pick the ID.
2. `export <id> --with-threads` → returns the output dir.
3. Report path and message count to the user.

## Rate limits & errors

- The script auto-sleeps on HTTP 429 using `Retry-After` and retries.
- Slack API errors are raised as `RuntimeError` with the `error` code (e.g. `not_in_channel`, `missing_scope`). Surface the code to the user verbatim — it usually tells them exactly what's wrong.

## Manual testing

The user can run `python3 ~/.claude/skills/slack/slack.py menu` to exercise the script interactively without going through Claude.
