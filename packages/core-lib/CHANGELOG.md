# Changelog

## [0.1.0] - 2024

### Added
- Domain-based organization (core, llm, vector, functions, env, shell)
- Provider registry pattern for extensibility
- Lightweight DI container for service management
- Shell service for command execution
- Env service for environment variable management
- Unit tests with Vitest
- ESLint configuration with TypeScript type checking
- Factory function with optional services support

### Changed
- Reorganized structure into domain folders
- Services now use DI container internally
- Updated exports to reflect new structure
- Replaced `any` types with `unknown` for better type safety
- Improved error handling with proper type guards
- All ESLint warnings resolved

