# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

- **Architecture**: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Features**: See [FEATURES.md](./FEATURES.md)
- **Known Issues**: See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)

## Commands

```bash
pnpm install          # install deps
pnpm start            # start gateway + all services
pnpm run typecheck    # tsc --noEmit
pnpm run test:run     # single test run
pnpm lint             # eslint + typecheck
```

## AI-Specific Tips

- **No `console.log`** — use `createLogger('service-name')` which emits to `log.onLog`
- **Domain boundaries** are enforced by ESLint. Services communicate only via `bus.call()` and `bus.emit()`
- **Config** is loaded from `~/.vargos/config.json` + `agent/models.json` + `agent/settings.json` (three-file consolidation)
- **API keys** are resolved from `agent/models.json` provider configs, not env vars
- **Workspace skills** from `~/.vargos/workspace/skills/<name>/SKILL.md` are auto-loaded by the Pi SDK
- **Chat directives** (`/think:<level>`, `/verbose`) are parsed by `lib/directives.ts` before reaching the agent
- **Commit messages** must not contain "Co-Authored-By" — the commit-msg hook rejects them

## Service Boot Order

```
config → log → fs → web → memory → media → agent → [cron → channels] → [webhooks → mcp] → [tcp server start] → bus.onReady emit
```

## Key Patterns

- Services extend a class with `@on` (pure events) and `@register` (callable RPC) decorated methods
- Each service exports a `boot(bus)` function that calls `bus.bootstrap(this)`
- Cross-service imports are forbidden. Use `bus.call('service.method', params)` instead
- Type-only imports from `services/config/` are allowed for type-checking `AppConfig`
