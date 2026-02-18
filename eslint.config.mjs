import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", "dist/**", "out/**", "apps/**", "packages/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // ── Domain boundary enforcement ──────────────────────────────────────
  // lib/ — pure utilities, no domain imports
  {
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/sessions/*", "*/channels/*", "*/cron/*", "*/memory/*", "*/tools/*", "*/services/*", "*/gateway/*", "*/mcp/*", "*/cli/*"],
          message: "lib/ is pure utilities — cannot import from domain or infrastructure modules",
        }],
      }],
    },
  },
  // agent/ — communicates with other domains via gateway RPC only
  // Exception: agent/runtime.ts takes ISessionService via DI
  {
    files: ["src/agent/**/*.ts"],
    ignores: ["src/agent/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/channels/*", "*/cron/*", "*/memory/*", "*/mcp/*", "*/cli/*"],
          message: "agent/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // sessions/ — no cross-domain imports
  {
    files: ["src/sessions/**/*.ts"],
    ignores: ["src/sessions/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/channels/*", "*/cron/*", "*/memory/*", "*/tools/*", "*/services/*", "*/mcp/*", "*/cli/*"],
          message: "sessions/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // channels/ — no cross-domain imports (except gateway for RPC types)
  {
    files: ["src/channels/**/*.ts"],
    ignores: ["src/channels/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/sessions/*", "*/cron/*", "*/memory/*", "*/tools/*", "*/services/*", "*/mcp/*", "*/cli/*"],
          message: "channels/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // cron/ — no cross-domain imports
  {
    files: ["src/cron/**/*.ts"],
    ignores: ["src/cron/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/sessions/*", "*/channels/*", "*/memory/*", "*/tools/*", "*/services/*", "*/mcp/*", "*/cli/*"],
          message: "cron/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // memory/ — no cross-domain imports
  {
    files: ["src/memory/**/*.ts"],
    ignores: ["src/memory/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/sessions/*", "*/channels/*", "*/cron/*", "*/tools/*", "*/services/*", "*/mcp/*", "*/cli/*"],
          message: "memory/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // tools/ — can import services/ (ProcessService, BrowserService)
  {
    files: ["src/tools/**/*.ts"],
    ignores: ["src/tools/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/agent/*", "*/sessions/*", "*/channels/*", "*/cron/*", "*/memory/*", "*/mcp/*", "*/cli/*"],
          message: "tools/ cannot import from other domain modules (except services/)",
        }],
      }],
    },
  },
);
