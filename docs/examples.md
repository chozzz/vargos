# Examples

---

## Example: MCP Integration

Vargos is both an MCP **server** (exposes its bus surface to external clients like Claude Desktop) and an MCP **client** (loads external MCP servers and makes their tools available to the agent).

The MCP server (`edge/mcp/`) is currently commented out in [`index.ts`](../index.ts) — only the client side is active. This example covers both for when the server is re-enabled.

### As an MCP client (active)

Connect external MCP servers; their tools appear to the agent as bus tools, namespaced `mcp.<server>.<tool>`.

Add to `~/.vargos/config.json`:

```jsonc
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "https://mycompany.atlassian.net",
        "JIRA_API_TOKEN": "..."
      }
    }
  }
}
```

The agent sees `mcp.atlassian.jira_create_issue`, etc. Channel personas can whitelist via glob: `allowedTools: ["mcp.atlassian.*"]`.

### As an MCP server (when re-enabled)

External clients connect to Vargos's HTTP MCP endpoint and call any registered bus method. Bearer-token auth.

Once `edge/mcp/` is uncommented in `index.ts`, configure your MCP client to point at `http://127.0.0.1:9001/mcp` with the configured bearer token. For Claude Desktop, use `mcp-remote` as a stdio↔HTTP shim.

### Common use cases

- **Jira / Atlassian** — create issues, search tickets, update status from chat
- **GitHub** — PRs, issues, repo management
- **Databases** — query, migrate via MCP
- **Custom** — any MCP server you build or find

### See also

- [MCP](./usage.md) — client + server overview
- [Configuration](./configuration.md) — `mcpServers` and `mcp` schemas

---

## Example: Scheduled Research & Reporting

Cron tasks fire on a schedule, the agent runs the prompt, and `notify` channels receive the result via `channel.send` (with `fromSessionKey` so the channel agent records the source).

### Example: Daily AI scan

A 9am daily cron prompts the agent to research and synthesize, then delivers to WhatsApp.

Create `~/.vargos/cron/daily-ai-scan.md`:

```yaml
---
id: daily-ai-scan
name: Daily AI Scan
schedule: "0 9 * * *"
enabled: true
notify:
  - whatsapp-personal:+614XXXXXXXXX
activeHours: [8, 22]
activeHoursTimezone: "Australia/Sydney"
---

Research today's AI news, GitHub trending, and package releases via web.fetch.
Spawn parallel subagents for each angle (use agent.execute with sub-session keys).
Synthesize into a single report under 800 words.
```

### How it works

1. Cron service fires at 9am Sydney (within active hours).
2. Agent runs in session `cron:daily-ai-scan:2026-05-06`.
3. Agent uses `agent.execute` to spawn parallel subagents on `cron:daily-ai-scan:2026-05-06:subagent:<topic>`. Each runs independently.
4. Parent synthesizes and returns the final report.
5. `services/cron/index.ts` calls `channel.send` with `fromSessionKey: cron:daily-ai-scan:2026-05-06`.
6. WhatsApp gets the report; the channel session's history records `[cron:daily-ai-scan:2026-05-06] <report>` so future replies have context.

### Related

- [Configuration](./configuration.md) — cron task schema
- [Sessions](./usage.md) — subagent sessionKey format and lifecycle
- [Runtime](./usage.md) — cross-session injection via `fromSessionKey`

---

## Example: Multi-Channel Presence

A single Vargos process serves WhatsApp, Telegram, cron, and CLI simultaneously. Each channel maintains its own session keyed by `<channelId>:<chatId>`, isolated from the others. The same agent runtime, tools, memory, and workspace serve all channels.

### How it works

Inbound flow per channel:

```
adapter (telegram/whatsapp)
  → normalizer
  → pipeline (whitelist, link-expand)
  → agent.execute (or agent.appendMessage if shouldExecute returns false)
  → reply via channel.send (back through originating channel)
```

Session keys: `telegram-personal:7789...`, `whatsapp-personal:614...`. Cron and `pnpm chat` use their own key formats — see [Sessions](./usage.md).

Each channel can have its own [persona file](./usage.md) at `~/.vargos/agents/<channelId>.md` to scope tool access and tweak the system prompt. Cron and webhooks deliver via `channel.send` with `fromSessionKey` so the receiver records source attribution in its history.

### Channel surface

| Channel | Status | Features |
|---|---|---|
| Telegram | ✅ | Long-polling, group chat (mention-only), voice, image, document extraction (PDF/DOCX/XLSX/TXT/MD), reactions, typing |
| WhatsApp | ✅ | Baileys linked-devices, voice, image, reactions, typing |
| Pi CLI (`pnpm chat`) | ✅ | Interactive REPL bound to `~/.vargos/agent` and `sessions/cli/` |
| Slack | 📋 | Planned |

### Setup

Configure both channels in `~/.vargos/config.json` `channels[]`. Each entry needs `type`, `id`, optional `allowFrom`. Telegram also needs `botToken`. Schema: [`services/config/schemas/channels.ts`](../services/config/schemas/channels.ts).

Setup walkthroughs: [Channels](./usage.md).

### See also

- [Channels](./usage.md) — adapter setup
- [Personas](./usage.md) — per-channel behavior overrides
- [Sessions](./usage.md) — sessionKey formats
