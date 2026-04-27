# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Merge to Main Workflow

**Only route: PR from `dev` → `main` with squash merge**

### Process
1. **Develop** on `dev` or feature branches (never commit to `main`)
   - Local pre-push hook blocks `git push origin main`
2. **Push to GitHub** and create PR `dev` → `main`
3. **All checks must pass:**
   - Lint & type checking (`pnpm run lint`, `pnpm run typecheck`)
   - Test suite (`pnpm run test:run`)
   - CodeQL security analysis
   - Semgrep SAST scanning
   - Dependency audit
4. **Squash merge only** (GitHub enforces this; merge commits blocked)
5. **Auto-delete branch** after merge

### Status Checks Required for Main
- `lint-and-typecheck` — ESLint + TypeScript
- `test` — vitest test suite
- `codeql` — GitHub CodeQL analysis

### If You Commit to Main by Accident
```bash
git reset --soft HEAD~1    # Undo last commit, keep changes staged
git checkout dev
git commit -m "your message"
git push origin dev
# Then create PR on GitHub
```

### Ruleset Details
- **Enforce: Main Branch Safety & Quality Gates** (GitHub Ruleset ID: 15580628)
  - Requires 1 approval before merge
  - Requires all status checks pass (strict mode)
  - Requires conversation resolution
  - Prevents direct pushes to main
  - Allows only squash merge strategy

## Key Patterns

- Services extend a class with `@on` (pure events) and `@register` (callable RPC) decorated methods
- Each service exports a `boot(bus)` function that calls `bus.bootstrap(this)`
- Cross-service imports are forbidden. Use `bus.call('service.method', params)` instead
- Type-only imports from `services/config/` are allowed for type-checking `AppConfig`
