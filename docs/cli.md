# CLI

> The interactive CLI is being rebuilt. This document will be updated when it ships.

## Current Usage

```bash
# Start the gateway and all services
vargos

# Or via pnpm in dev
pnpm start
```

The `vargos` binary starts the gateway, connects all services, and prints a startup banner. It runs in the foreground; `Ctrl+C` for clean shutdown.

## Planned Commands

The new CLI will restore commands for gateway control, sessions, cron, channels, and config management. Track progress in [FEATURES.md](../FEATURES.md).
