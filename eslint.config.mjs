import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Domain services. `config` is intentionally excluded: it owns the shared config
// schema/types (AppConfig, CronTaskSchema, …) every service may import directly.
// All other cross-domain communication goes through the bus.
const SERVICES = ["agent", "channel", "cron", "log", "mcp", "media", "memory", "web"];

const boundaryRules = SERVICES.map((svc) => ({
  files: [`services/${svc}/**/*.ts`],
  ignores: [`services/${svc}/**/*.test.ts`],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: [
          ...SERVICES.filter((s) => s !== svc).map((s) => `*/services/${s}/*`),
          "*/edge/*",
        ],
        message: `${svc}/ communicates with other domains via the bus only`,
      }],
    }],
  },
}));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", "dist/**", "out/**", "apps/**", "packages/**", ".templates/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // ── Domain boundary enforcement ──────────────────────────────────────
  // lib/ — pure utilities; can import from core but not from services or edge
  {
    files: ["lib/**/*.ts"],
    ignores: ["lib/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/services/*", "*/edge/*"],
          message: "lib/ is pure utilities — cannot import from service or edge modules (core is allowed)",
        }],
      }],
    },
  },
  ...boundaryRules,
  // edge/ — external adapters can talk to core and services but not each other
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
);
