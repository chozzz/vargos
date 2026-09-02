/**
 * The `web/` package is its own eslint universe (next/core-web-vitals, its own
 * eslint 9). The root eslint (v10) must never be handed a path inside it — flat
 * config would auto-discover web/eslint.config.mjs and crash on the version skew.
 * web/ is linted by its own `pnpm --filter @chozzz/vargos-web lint`.
 */
export default {
  "*.ts": (files) => {
    const rootFiles = files.filter((f) => !/(^|\/)web\//.test(f));
    return rootFiles.length ? [`eslint --fix ${rootFiles.map((f) => `"${f}"`).join(" ")}`] : [];
  },
};
