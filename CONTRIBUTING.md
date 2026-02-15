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

Not every PR will be merged. We review carefully to keep the project focused.

## Code Style

- TypeScript with ESM (`.js` extensions on imports)
- Fewer lines is better — delete before extending
- Test at service boundaries, not implementation details
- Follow existing patterns before introducing new ones

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](./LICENSE.md).
