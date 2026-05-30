import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMigrations, type Migration, type MigrationContext } from '../migrate.js';

const noopLog: MigrationContext['log'] = { info() {}, warn() {} };

describe('applyMigrations', () => {
  let dir: string;
  let ledger: string;
  let ctx: MigrationContext;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vargos-mig-'));
    ledger = path.join(dir, '.migrations.json');
    ctx = { paths: { dataDir: dir } as MigrationContext['paths'], log: noopLog };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  const mk = (id: string, ran: string[]): Migration => ({
    id, description: id, async run() { ran.push(id); },
  });

  it('runs each migration once, in order, and records the ledger', async () => {
    const ran: string[] = [];
    const migs = [mk('001', ran), mk('002', ran)];

    const first = await applyMigrations(migs, ledger, ctx);
    expect(ran).toEqual(['001', '002']);
    expect(first.applied).toEqual(['001', '002']);

    // Second pass: nothing re-runs (ids already in ledger)
    const second = await applyMigrations(migs, ledger, ctx);
    expect(ran).toEqual(['001', '002']);
    expect(second.applied).toEqual([]);

    // A newly appended migration runs; prior ones stay skipped
    const third = await applyMigrations([...migs, mk('003', ran)], ledger, ctx);
    expect(ran).toEqual(['001', '002', '003']);
    expect(third.applied).toEqual(['003']);
  });

  it('dry-run reports pending without executing or recording', async () => {
    const ran: string[] = [];
    const res = await applyMigrations([mk('001', ran)], ledger, ctx, { dryRun: true });
    expect(ran).toEqual([]);
    expect(res.pending).toEqual(['001']);
    await expect(fs.access(ledger)).rejects.toThrow(); // no ledger written
  });

  it('stops on first failure so order is preserved and it retries next run', async () => {
    const ran: string[] = [];
    const boom: Migration = { id: '002', description: 'boom', async run() { throw new Error('fail'); } };

    await applyMigrations([mk('001', ran), boom, mk('003', ran)], ledger, ctx);
    expect(ran).toEqual(['001']); // 003 never reached

    // Fix '002' on retry: it and the rest now run
    const fixed = mk('002', ran);
    await applyMigrations([mk('001', ran), fixed, mk('003', ran)], ledger, ctx);
    expect(ran).toEqual(['001', '002', '003']); // 001 not re-run
  });
});
