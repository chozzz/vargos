# CLI

Vargos provides an interactive menu and direct commands.

## Interactive Menu

```bash
vargos
```

Bare `vargos` opens an interactive menu with breadcrumb navigation. Select commands with arrow keys.

## Commands

| Command | Description |
|---------|-------------|
| `vargos` | Interactive menu |
| `vargos chat` | Chat session (requires running gateway) |
| `vargos run <task>` | One-shot task |
| `vargos gateway start` | Start gateway + all services |
| `vargos gateway stop` | Stop running gateway |
| `vargos gateway restart` | Restart gateway |
| `vargos gateway status` | Check gateway process status |
| `vargos channels send <target> <msg>` | Send a message to a channel target |
| `vargos sessions list` | List all sessions |
| `vargos sessions history <key>` | Show session transcript |
| `vargos health` | Config + connectivity check |

## Session Commands

| Command | Description |
|---------|-------------|
| `vargos sessions list` | Show all sessions with kind, label, last activity |
| `vargos sessions history <key>` | Show session transcript |

## Config Commands

| Command | Description |
|---------|-------------|
| `vargos config llm show` | Display current LLM config |
| `vargos config llm edit` | Change provider, model, API key |
| `vargos config channel show` | Display channel config |
| `vargos config channel edit` | Configure channels |
| `vargos config context show` | List context files |
| `vargos config context edit` | Edit context files |
| `vargos config heartbeat show` | Display heartbeat config |
| `vargos config heartbeat edit` | Configure heartbeat schedule |

## Channel Commands

| Command | Description |
|---------|-------------|
| `vargos channels send <target> <message>` | Send a message to a channel (e.g. `whatsapp:61400000000 "Hello"`) |

## Webhook Commands

| Command | Description |
|---------|-------------|
| `vargos webhooks list` | Show configured webhooks |
| `vargos webhooks status` | Show webhook fire stats |

## Cron Commands

| Command | Description |
|---------|-------------|
| `vargos cron list` | Show scheduled tasks |
| `vargos cron add` | Add a scheduled task (interactive wizard) |
| `vargos cron remove [id]` | Remove a scheduled task (interactive picker or by ID) |
| `vargos cron trigger [id]` | Manually trigger a task (interactive picker or by ID) |
| `vargos cron logs [filter]` | View past cron executions |

## Gateway Lifecycle

The gateway runs as a background process managed via PID file.

```bash
vargos gateway start      # Start (exits if already running)
vargos gateway status     # Shows PID and uptime
vargos gateway restart    # Stop + start
vargos gateway stop       # Graceful shutdown
```

## Chat Mode

```bash
vargos chat
```

Opens an interactive chat session connected to the running gateway. Conversation persists across restarts — run `vargos chat` again to resume.

## Run Mode

```bash
vargos run "Analyze this codebase"
```

One-shot task execution. Each run creates a unique session (`cli:run:<timestamp>`), so history doesn't accumulate.

## Health Check

```bash
vargos health
```

Validates config, checks gateway connectivity, and reports service status.
