# Contributing to Vargos

Thanks for your interest in Vargos.

## Issues First

Before opening a PR, start with an issue:

- **Bug reports** — what happened, what you expected, steps to reproduce
- **Feature requests** — describe the use case, not just the solution
- **Questions** — anything unclear about the project

[Open an issue](https://github.com/chozzz/vargos/issues)

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
- Token budget is sacred — keep system prompts under 4,000 characters

## Running Tests

```bash
pnpm test              # Watch mode
pnpm run test:run      # Single run
pnpm run typecheck     # TypeScript check
```

## More Details

For deeper understanding of the project:

- [Architecture Deep Dive](./docs/architecture/bus-design.md) — Event bus design, service patterns
- [Channels Design](./docs/architecture/channels-design.md) — Channel provider architecture
- [API Reference](./docs/api-reference.md) — Complete bus RPC reference
- [Development Guide](./docs/debugging.md) — Debug modes and logging

## Project Status

See [FEATURES.md](./FEATURES.md) for the complete feature inventory with implementation status.
See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned features.
See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for current bugs and workarounds.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE).
