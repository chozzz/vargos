import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { noUnusedEventsRule } from "./eslint-rules/unused-events.mjs";

const customPlugin = {
  rules: {
    "no-unused-events": noUnusedEventsRule,
  },
};

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
  // lib/ — pure utilities; can import from gateway but not from services or edge
  {
    files: ["lib/**/*.ts"],
    ignores: ["lib/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/*", "*/edge/*"],
          message: "lib/ is pure utilities — cannot import from service or edge modules (gateway is allowed)",
        }],
      }],
    },
  },
  // services/agent-v2/ — bus + Pi SDK; no direct imports from other domain services
  {
    files: ["services/agent-v2/**/*.ts"],
    ignores: ["services/agent-v2/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/channels/*", "*/services/cron/*", "*/services/memory/*", "*/edge/*"],
          message: "agent-v2 communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/channels/ — no cross-domain imports
  {
    files: ["services/channels/**/*.ts"],
    ignores: ["services/channels/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent-v2/*", "*/services/cron/*", "*/services/memory/*", "*/services/tools/*", "*/edge/*"],
          message: "channels/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/cron/ — no cross-domain imports
  {
    files: ["services/cron/**/*.ts"],
    ignores: ["services/cron/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent-v2/*", "*/services/channels/*", "*/services/memory/*", "*/services/tools/*", "*/edge/*"],
          message: "cron/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/memory/ — no cross-domain imports
  {
    files: ["services/memory/**/*.ts"],
    ignores: ["services/memory/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent-v2/*", "*/services/channels/*", "*/services/cron/*", "*/services/tools/*", "*/edge/*"],
          message: "memory/ communicates with other domains via gateway RPC only",
        }],
      }],
    },
  },
  // services/tools/ — can import services/browser + services/process
  {
    files: ["services/tools/**/*.ts"],
    ignores: ["services/tools/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/agent-v2/*", "*/services/channels/*", "*/services/cron/*", "*/services/memory/*", "*/edge/*"],
          message: "tools/ cannot import from other domain services (browser/process are allowed)",
        }],
      }],
    },
  },
  // edge/ — external adapters, can talk to gateway and services
  {
    files: ["edge/**/*.ts"],
    ignores: ["edge/**/*.test.ts"],
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
  // Custom: validate EventMap usage
  {
    files: ["gateway/events.ts"],
    plugins: {
      custom: customPlugin,
    },
    rules: {
      "custom/no-unused-events": "error",
    },
  },
);
