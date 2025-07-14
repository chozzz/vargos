import { config as baseConfig } from "@workspace/eslint-config/base";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  baseConfig,
  {
    ignores: ["dist/**", "**/*.test.ts", "*.config.*", "vitest.config.ts"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);

