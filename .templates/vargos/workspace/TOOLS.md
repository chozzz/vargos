<!-- Bootstrap file: injected into every session. Keep under 6000 chars. -->

# TOOLS.md - Tool Reference

## Filesystem

- `fs.read` — read files (absolute or ~-relative paths)
- `fs.write` — create/overwrite files (auto-creates parent dirs)
- `fs.edit` — replace exact string in file
- `fs.exec` — run shell commands, returns stdout/stderr/exitCode

## Memory

- `memory.search` — semantic search across memory files
- `memory.read` — read specific memory file
- `memory.write` — write to memory directory
- `memory.stats` — memory index stats

## Agents

- `agent.execute` — spawn sub-agent for focused task
- `agent.status` — check active agent sessions

## Config

- `config.get` — get merged app config
- `config.set` — update config (routes to correct file)

## Channels

- `channel.send` — send text message
- `channel.sendMedia` — send file/media
- `channel.search` — list channel adapters
- `channel.get` — channel status

## Cron

- `cron.search` — list scheduled tasks
- `cron.add` / `cron.update` / `cron.remove` — manage tasks
- `cron.run` — trigger immediately

## Bus

- `bus.search` — search available bus events
- `bus.inspect` — get event metadata

## Audio

- `media.transcribeAudio` — transcribe audio file

## Logs

- `log.search` — search persisted logs by level/service

## Project Paths

## Make It Yours

This is a starting point. Add your own conventions as you figure out what works.