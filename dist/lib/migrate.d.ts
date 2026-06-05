/**
 * Run-once data migrations. Migration modules live in `.migrations/` (compiled to
 * `dist/.migrations/`), each a default-exported { id, description, run }. Applied ids
 * are tracked in `~/.vargos/.migrations.json`, so each runs exactly once — on boot
 * (automatic) or via `vargos migrate` / `pnpm migrate`.
 *
 * To add one: drop `NNN-name.ts` into `.migrations/`. Order is filename order.
 */
import { type DataPaths } from './paths.js';
export interface MigrationContext {
    paths: DataPaths;
    log: {
        info(s: string): void;
        warn(s: string): void;
    };
}
export interface Migration {
    /** Stable unique id (e.g. '001-drop-workspace-agents-md'). Recorded once applied. */
    id: string;
    description: string;
    run(ctx: MigrationContext): Promise<void>;
}
/**
 * Apply pending migrations in order, recording each id on success. Stops on the first
 * failure so ordering is preserved (the failed one retries next run). Pure core — the
 * ledger file and migration list are injected, so it's directly testable.
 */
export declare function applyMigrations(migrations: Migration[], ledgerFile: string, ctx: MigrationContext, opts?: {
    dryRun?: boolean;
}): Promise<{
    applied: string[];
    pending: string[];
}>;
/** Discover and run all pending migrations. Safe to call on every boot. */
export declare function runMigrations(log: MigrationContext['log'], opts?: {
    dryRun?: boolean;
}): Promise<void>;
//# sourceMappingURL=migrate.d.ts.map