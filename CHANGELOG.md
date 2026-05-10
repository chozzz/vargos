# Changelog

All notable changes to Vargos will be documented in this file.

## [2.0.3] — 2026-05-08

### Added

- CLI entrypoint (`cli.ts`) with first-run detection and subcommand dispatch.
- Interactive onboarding wizard (`cli/onboard.ts`) for provider, model, and API key setup.
- `vargos` binary now supports `start`, `onboard`, `config`, `--version`, and `--help`.
- Runtime Node.js version guard (requires >= 20).
- Code of Conduct.

### Changed

- `bin` field now points to `dist/cli.js` instead of `dist/index.js`.
- Build script (`pnpm build`) now cleans `dist/` before compiling and copies `.templates/`.
- `pnpm cli` now runs `tsx cli.ts` (local dev entrypoint).

## [2.0.2] and earlier

See git history for changes prior to 2.0.3.
