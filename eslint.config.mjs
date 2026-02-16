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
  // ── Dependency layer enforcement ──────────────────────────────────────
  // Layer 0: contracts/ — pure types, no src/ imports
  {
    files: ["src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/lib/*", "*/config/*", "*/protocol/*", "*/tools/*", "*/gateway/*", "*/client/*", "*/runtime/*", "*/extensions/*", "*/mcp/*", "*/cli/*", "*/channels/*"],
          message: "contracts/ is Layer 0 — cannot import from other src/ modules",
        }],
      }],
    },
  },
  // Layer 1: lib/ — can only import contracts/
  {
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/config/*", "*/protocol/*", "*/tools/*", "*/gateway/*", "*/client/*", "*/runtime/*", "*/extensions/*", "*/mcp/*", "*/cli/*", "*/channels/*"],
          message: "lib/ is Layer 1 — can only import from contracts/",
        }],
      }],
    },
  },
  // Layer 5: runtime/ — cannot import gateway/, client/, extensions/, mcp/, cli/
  {
    files: ["src/runtime/**/*.ts"],
    ignores: ["src/runtime/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/gateway/*", "*/client/*", "*/extensions/*", "*/mcp/*", "*/cli/*"],
          message: "runtime/ cannot import from gateway/, client/, extensions/, mcp/, or cli/",
        }],
      }],
    },
  },
  // Layer 6: extensions/ — cannot import client/, gateway/, cli/, mcp/
  {
    files: ["src/extensions/**/*.ts"],
    ignores: ["src/extensions/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["*/client/*", "*/gateway/*", "*/cli/*", "*/mcp/*"],
          message: "extensions/ cannot import from client/, gateway/, cli/, or mcp/",
        }],
      }],
    },
  },
);
