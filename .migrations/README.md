# Migrations

Run-once data migrations, applied automatically on boot and via `vargos migrate` /
`pnpm migrate` (`--dry-run` to preview). Applied ids are tracked in
`~/.vargos/.migrations.json`, so each runs exactly once.

To add one, drop a file here named `NNN-short-name.ts` (filename order = run order):

```ts
import type { Migration } from '../lib/migrate.js';

const migration: Migration = {
  id: '002-example',
  description: 'what it does',
  async run({ paths, log }) { /* idempotent-ish; throwing retries next run */ },
};
export default migration;
```
