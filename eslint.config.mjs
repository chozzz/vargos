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
          group: ["*/services/*", "*/gateway/*", "*/edge/*", "*/config/*"],
          message: "lib/ is pure utilities — cannot import from domain or infrastructure modules",
        }],
      }],
    },
  },
  // services/agent/ — communicates with other domains via gateway RPC only
  {
    files: ["src/services/agent/**/*.ts"],
    ignores: ["src/services/agent/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/channels/*", "*/services/cron/*", "*/services/memory/*", "*/edge/*"],
          message: "agent/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/sessions/ — no cross-domain imports
  {
    files: ["src/services/sessions/**/*.ts"],
    ignores: ["src/services/sessions/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent/*", "*/services/channels/*", "*/services/cron/*", "*/services/memory/*", "*/services/tools/*", "*/edge/*"],
          message: "sessions/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/channels/ — no cross-domain imports
  {
    files: ["src/services/channels/**/*.ts"],
    ignores: ["src/services/channels/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent/*", "*/services/sessions/*", "*/services/cron/*", "*/services/memory/*", "*/services/tools/*", "*/edge/*"],
          message: "channels/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/cron/ — no cross-domain imports
  {
    files: ["src/services/cron/**/*.ts"],
    ignores: ["src/services/cron/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent/*", "*/services/sessions/*", "*/services/channels/*", "*/services/memory/*", "*/services/tools/*", "*/edge/*"],
          message: "cron/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/memory/ — no cross-domain imports
  {
    files: ["src/services/memory/**/*.ts"],
    ignores: ["src/services/memory/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent/*", "*/services/sessions/*", "*/services/channels/*", "*/services/cron/*", "*/services/tools/*", "*/edge/*"],
          message: "memory/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/tools/ — can import services/browser + services/process
  {
    files: ["src/services/tools/**/*.ts"],
    ignores: ["src/services/tools/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent/*", "*/services/sessions/*", "*/services/channels/*", "*/services/cron/*", "*/services/memory/*", "*/edge/*"],
          message: "tools/ cannot import from other domain services (browser/process are allowed)",
        }],
      }],
    },
  },
  // edge/ — external adapters, can talk to gateway and services
  {
    files: ["src/edge/**/*.ts"],
    ignores: ["src/edge/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/edge/mcp/*", "*/edge/webhooks/*"],
          message: "edge adapters cannot import from each other",
        }],
      }],
    },
  },
  // gateway/ — orchestration layer, no restrictions (intentionally imports everything)
);
