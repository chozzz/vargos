# Contributing to Vargos

Thanks for your interest in Vargos.

## Issues First

Before opening a PR, start with an issue:

- **Bug reports** — what happened, what you expected, steps to reproduce
- **Feature requests** — describe the use case, not just the solution
- **Questions** — anything unclear about the project

[Open an issue](https://github.com/chozzz/vargos/issues)

## Branch Workflow

- Develop on `dev` or feature branches. **Never commit to `main`.** A pre-push hook blocks `git push origin main`.
- Open a PR from your branch into `dev` first; the maintainer merges `dev` → `main`.
- Squash-merge only into `main`. The ruleset rejects merge commits.
- Required status checks on `main`: `lint-and-typecheck`, `test`, `codeql`.
- **Do not include `Co-Authored-By` in commit messages** — the commit-msg hook rejects them.

## Pull Requests

1. **Open an issue first** — propose your idea or bugfix before writing code
2. **Wait for feedback** — we'll discuss scope and approach
3. **Keep it focused** — small, single-purpose PRs are easier to review
4. **Test your changes** — run `pnpm run test:run` and `pnpm run typecheck`

## Code Style

- TypeScript with ESM (`.js` extensions on imports)
- Fewer lines is better — delete before extending
- Test at service boundaries, not implementation details
- Follow existing patterns before introducing new ones
- No `console.log` — use `createLogger('service-name')` which emits to `log.onLog`
- **Domain boundaries** are enforced by ESLint (`no-restricted-imports`). Services communicate only via `bus.call()` / `bus.emit()` — no direct cross-domain imports.
- Bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`) are head/tail-truncated to 6K chars each — design prompts to survive that.

## Running Tests

```bash
pnpm test              # Watch mode
pnpm run test:run      # Single run
pnpm run typecheck     # TypeScript check
pnpm lint              # ESLint + typecheck
```

## More Details

For deeper understanding of the project:

- [Architecture Deep Dive](./docs/architecture/bus-design.md) — Event bus design, service patterns
- [Channels Design](./docs/architecture/channels-design.md) — Channel provider architecture
- [API Reference](./docs/api-reference.md) — Complete bus RPC reference
- [Debugging](./docs/debugging.md) — Debug modes and logging

## Project Status

- [FEATURES.md](./FEATURES.md) — feature inventory + known limitations
- [docs/ROADMAP.md](./docs/ROADMAP.md) — planned work

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
