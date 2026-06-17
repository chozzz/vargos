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
python3 ~/.vargos/agent/skills/slack/slack.py auth
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
| `mentions [--days N] [--unread-only] [--query Q] [--limit N]` | "Who pinged me?" — searches for `<@you>` over the last N days (default 14). `--query` appends extra search modifiers. |
| `unreads [--max-channels N]` | Channels & DMs with `unread_count > 0`, sorted by recency, with a one-line preview of the latest message. |
| `activity [--limit N] [--max-channels N]` | Your conversations sorted by latest message ts, with sender + preview. |
| `digest [--days N] [--mentions-limit N] [--unreads-limit N] [--activity-limit N]` | Composite morning catch-up: combines mentions + unreads + activity in one report. Run this for "what did I miss?". |
| `from <user> [--days N] [--channel C] [--query Q] [--limit N]` | "What did Alice say?" — `search.messages` with `from:@user` (+ optional `in:#channel`). |
| `permalink <channel> <ts>` | Resolve a `channel + ts` pair to the clickable `slack.com/archives/…` URL. |
| `mark-read <channel> [--ts TS]` | `conversations.mark` up to the given ts (default: latest message). |
| **Authoring** | |
| `edit <channel> <ts> <text>` | `chat.update` — only works on messages the auth'd user owns. |
| `delete <channel> <ts>` | `chat.delete`. |
| `upload <channel> <path> [--comment T] [--title T] [--thread TS]` | Uploads a file via the modern `files.getUploadURLExternal` → presigned PUT → `files.completeUploadExternal` flow. |
| `schedule <channel> <text> --at <when>` | `chat.scheduleMessage`. `<when>` is unix epoch, ISO datetime, or relative offset like `+30m` / `+2h` / `+1d`. |
| **Channel actions** | |
| `pins <channel>` | Pinned messages (`pins.list`). |
| `bookmarks <channel>` | Channel bookmark links (`bookmarks.list`). |
| `members <channel>` | Member list resolved to names. |
| `join <channel>` / `leave <channel>` | Membership ops. |
| `invite <channel> <user> [<user>...]` | Invite by `@name`, name, or `U-ID`. |
| **Presence** | |
| `set-status <text> [--emoji E] [--expires SEC]` | Set status text + emoji + optional expiry (unix epoch). |
| `snooze <minutes>` / `unsnooze` | DnD on/off. |
| **Recall** | |
| `reminders` | Your reminders (`reminders.list`). |
| `set-reminder <text> --at <when>` | `reminders.add`. `<when>` accepts Slack natural language ("in 30 min", "tomorrow at 9am") OR unix epoch. |
| `saved [--limit N]` | "Saved for later" items (`stars.list` — Slack renamed the UI but kept the API). |
| `export <channel> [--output DIR] [--with-threads] [--workers N]` | Dump full history + threads to `<dir>/messages.json` and `<dir>/channel.json`. |
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

## Conversational query → command

These are the natural questions users ask and the commands that answer them. Don't dump raw JSON back; pull the useful fields and present them as a short list.

| User says… | Run | Notes |
|---|---|---|
| "Who pinged me?" / "Any mentions today?" | `mentions --days 1` | Default window is 14 days. Each result has a `permalink` — surface it. |
| "Was I mentioned about X?" | `mentions --days 30 --query "X"` | `--query` appends to the search string. |
| "Unread mentions only" | `mentions --unread-only` | Uses Slack's `is:unread` search modifier. |
| "What did I miss?" / "What's unread?" | `unreads` | Returns channels with `unread_count` + latest preview. Mention the count and the top few. |
| "What was recent Slack activity?" / "What's busy?" | `activity --limit 10` | Top-N conversations by most recent message. Good "catch me up" answer. |
| "Send a link to that message" / "Get the URL" | `permalink <channel> <ts>` | If the user only gave you a description, find the ts via `history` first, then `permalink`. |
| "Mark #x as read" / "I read those" | `mark-read <channel>` | Defaults to marking up to the latest message — no ts needed. |
| "Reply to <person>'s last message" | `history @person --limit 1` → grab `ts` → `send @person <text> --thread <ts>` | Two-step. Confirm the message you found before replying. |
| "Catch me up on #channel today" | `history <channel> --oldest <today-midnight-epoch> --with-threads` | Summarize the result; don't paste raw JSON. |
| "What's in my DMs?" | `activity --limit 20` then filter to `channel` starting with `@` | Or `list-channels --type im` for the raw list. |
| "Morning Slack catch-up" / "What did I miss overnight?" | `digest --days 1` | Single call returns mentions + unreads + top activity. Summarize each section briefly. |
| "What did Alice say this week?" | `from alice --days 7` | Add `--channel #x` to scope; add `--query "X"` for a topic filter. |
| "Did anyone mention bug 1234?" | `mentions --days 30 --query "1234"` | `--query` appends to the mention search. |
| "What's pinned in #general?" | `pins #general` | |
| "Show me the channel bookmarks" | `bookmarks #channel` | Bookmarks are the link buttons at the top of a channel. |
| "Who's in #engineering?" | `members #engineering` | Returns id/name/real_name. Bots are flagged with `is_bot`. |
| "Fix the typo in my last message" | `history #x --limit 1` → grab `ts` → `edit #x <ts> <new-text>` | Confirm the message you're editing before calling `edit`. |
| "Delete that message" | `delete <channel> <ts>` | Always confirm first. |
| "Send this file to #x" | `upload #x /path/to/file [--comment "..."]` | Resolves channel, runs the 3-step upload flow, returns the permalink. |
| "Schedule a 'standup in 5 min' message for tomorrow 9am" | `schedule #x "standup in 5 min" --at "2026-06-18T09:00+10:00"` | Convert natural-language times to ISO yourself; the script accepts ISO / unix / `+Nm`/`+Nh`/`+Nd`. |
| "I'm in a meeting" / "Set my status" | `set-status "In a meeting" --emoji calendar --expires <unix-end>` | Empty text + empty emoji = clear status. |
| "Focus mode for 90 minutes" | `snooze 90` | `unsnooze` to end early. |
| "Remind me to follow up on this in an hour" | `set-reminder "follow up" --at "in 1 hour"` | The `reminders.add` endpoint parses Slack-native time strings, so you can pass them through. |
| "What reminders do I have?" | `reminders` | |
| "What did I save for later?" | `saved` | |
| "Add Bob to #x" | `invite #x @bob` | Multiple users can be passed positionally. |
| "Join #announcements" / "Leave #noisy" | `join #x` / `leave #x` | Both are write operations — confirm first. |

### Presentation tips

- For `mentions`, `unreads`, `activity`, `digest`, `from`: collapse each row to a single line — `@user in #channel: "preview…" <permalink>` — and list them. Don't show raw ts values unless asked.
- For `digest`: present the three sections (mentions / unreads / activity) under clear headers; lead with mentions because that's what needs human action.
- `unreads`, `activity`, and `digest` make many API calls (one `info` and/or `history` per channel) and parallelize with `--workers` (default 8). Bump it to 16 if your token isn't getting rate-limited; lower it if you are. 429s auto-retry with `Retry-After`.
- `mentions` and `from` only see what Slack search indexes. Very fresh messages (< ~30s) may not appear yet.
- Write ops (`send`, `edit`, `delete`, `upload`, `schedule`, `join`, `leave`, `invite`, `set-status`, `snooze`, `unsnooze`, `set-reminder`, `mark-read`, `react`) — confirm with the user first.
- `edit` only works on messages owned by the auth'd user. If a user asks you to edit someone else's, return Slack's `cant_update_message` error verbatim.
- For `schedule`: convert natural-language times to ISO yourself (today's date is in your context). The script accepts ISO, unix epoch, or `+Nm/+Nh/+Nd` relative offsets — but NOT free-form English.
- For `set-reminder`: pass the user's natural-language time string through to `--at` verbatim. Slack's `reminders.add` parses "in 30 minutes", "tomorrow at 9am", etc.

## Rate limits & errors

- The script auto-sleeps on HTTP 429 using `Retry-After` and retries.
- Slack API errors are raised as `RuntimeError` with the `error` code (e.g. `not_in_channel`, `missing_scope`). Surface the code to the user verbatim — it usually tells them exactly what's wrong.

## Manual testing

The user can run `python3 ~/.vargos/agent/skills/slack/slack.py menu` to exercise the script interactively without going through Claude.
