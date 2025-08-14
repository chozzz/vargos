# Vargos CLI

Lightweight Rust CLI for interacting with Mastra agents via terminal.

## Status

✅ **Phases 0-3 Complete**: Foundation, config, agent communication, and command mode  
⏳ **Pending**: Streaming, REPL, Terminal UI, Markdown rendering

## Quick Start

```bash
# Build (via turborepo)
pnpm build

# Or directly with cargo
cargo build --release

# Run
./target/release/vargos-cli --help
```

## Usage

```bash
# List agents
vargos-cli --list-agents

# Agent info
vargos-cli --agent-info vargosAgent

# Send message
vargos-cli --agent vargosAgent "Hello"

# Pipe input
echo "Hello" | vargos-cli --agent vargosAgent
```

## Configuration

Config: `~/.config/vargos-cli/config.yaml`

```yaml
mastra_url: "http://localhost:4862"
default_agent: "vargosAgent"
```

Env vars: `VARGOS_CLI_MASTRA_URL`, `VARGOS_CLI_AGENT`

## Development

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for details.
