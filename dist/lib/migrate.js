/**
 * Run-once data migrations. Migration modules live in `.migrations/` (compiled to
 * `dist/.migrations/`), each a default-exported { id, description, run }. Applied ids
 * are tracked in `~/.vargos/.migrations.json`, so each runs exactly once — on boot
 * (automatic) or via `vargos migrate` / `pnpm migrate`.
 *
 * To add one: drop `NNN-name.ts` into `.migrations/`. Order is filename order.
 */
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDataPaths } from './paths.js';
/** Walk up to locate the `.migrations/` dir — repo root in dev, `dist/` in prod. */
function findMigrationsRoot() {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (dir !== path.dirname(dir)) {
        const candidate = path.join(dir, '.migrations');
        if (existsSync(candidate))
            return candidate;
        dir = path.dirname(dir);
    }
    return null;
}
/** Load migration modules from a directory, sorted by filename. */
async function loadMigrations(root) {
    const files = (await fs.readdir(root))
        .filter(f => /^\d.*\.(js|ts)$/.test(f) && !f.endsWith('.d.ts'))
        .sort();
    const migrations = [];
    for (const file of files) {
        const mod = await import(pathToFileURL(path.join(root, file)).href);
        if (mod.default)
            migrations.push(mod.default);
    }
    return migrations;
}
/**
 * Apply pending migrations in order, recording each id on success. Stops on the first
 * failure so ordering is preserved (the failed one retries next run). Pure core — the
 * ledger file and migration list are injected, so it's directly testable.
 */
export async function applyMigrations(migrations, ledgerFile, ctx, opts = {}) {
    const ledger = await fs.readFile(ledgerFile, 'utf-8')
        .then(c => JSON.parse(c))
        .catch(() => ({ applied: [] }));
    const done = new Set(ledger.applied);
    const pending = migrations.filter(m => !done.has(m.id));
    const justApplied = [];
    for (const m of pending) {
        if (opts.dryRun) {
            ctx.log.info(`[dry-run] would run ${m.id}: ${m.description}`);
            continue;
        }
        try {
            ctx.log.info(`running migration ${m.id}: ${m.description}`);
            await m.run(ctx);
            done.add(m.id);
            await fs.mkdir(path.dirname(ledgerFile), { recursive: true });
            await fs.writeFile(ledgerFile, JSON.stringify({ applied: [...done] }, null, 2));
            justApplied.push(m.id);
            ctx.log.info(`✅ migration ${m.id} applied`);
        }
        catch (err) {
            ctx.log.warn(`migration ${m.id} failed (retries next run): ${err instanceof Error ? err.message : String(err)}`);
            break;
        }
    }
    return { applied: justApplied, pending: pending.map(m => m.id) };
}
/** Discover and run all pending migrations. Safe to call on every boot. */
export async function runMigrations(log, opts = {}) {
    const root = findMigrationsRoot();
    if (!root)
        return;
    const paths = getDataPaths();
    const ledgerFile = path.join(paths.dataDir, '.migrations.json');
    const migrations = await loadMigrations(root);
    await applyMigrations(migrations, ledgerFile, { paths, log }, opts);
}
//# sourceMappingURL=migrate.js.map