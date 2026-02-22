/**
 * One-time migration: merge old timestamped cron sessions into persistent ones.
 *
 * Old format: cron:<taskId>:<timestamp> → sessions/cron-<taskId>-<timestamp>/cron-<taskId>-<timestamp>.jsonl
 * New format: cron:<taskId>          → sessions/cron-<taskId>/cron-<taskId>.jsonl
 *
 * Usage: npx tsx scripts/migrate-cron-sessions.ts [--dry-run]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = process.env.VARGOS_DATA_DIR || path.join(os.homedir(), '.vargos');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const DRY_RUN = process.argv.includes('--dry-run');

interface SessionMeta {
  sessionKey: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

// Match old cron session dirs: cron-<taskId>-<timestamp>
// Task IDs look like: cron-1708300000-a1b2c
// So full dir name: cron-cron-1708300000-a1b2c-1708300000000
const CRON_TIMESTAMPED_RE = /^(cron-.+)-(\d{13,})$/;

async function main() {
  console.log(`Sessions dir: ${SESSIONS_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  let entries: string[];
  try {
    entries = await fs.readdir(SESSIONS_DIR);
  } catch {
    console.log('No sessions directory found. Nothing to migrate.');
    return;
  }

  // Group old cron dirs by task ID
  const groups = new Map<string, string[]>(); // taskId → [full dir names]

  for (const entry of entries) {
    const match = entry.match(CRON_TIMESTAMPED_RE);
    if (!match) continue;

    // Verify it's actually a cron session by checking the file inside
    const jsonlPath = path.join(SESSIONS_DIR, entry, `${entry}.jsonl`);
    try {
      const content = await fs.readFile(jsonlPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      if (!firstLine) continue;
      const meta = JSON.parse(firstLine) as SessionMeta;
      if (!meta.sessionKey?.startsWith('cron:')) continue;
    } catch {
      continue;
    }

    const baseDir = match[1]; // e.g. "cron-cron-abc123-x7k"
    if (!groups.has(baseDir)) groups.set(baseDir, []);
    groups.get(baseDir)!.push(entry);
  }

  if (groups.size === 0) {
    console.log('No old cron sessions found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${groups.size} cron task(s) with old timestamped sessions:\n`);

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const [baseDir, dirs] of groups) {
    // Sort by timestamp (oldest first) for chronological merge
    dirs.sort((a, b) => {
      const tsA = parseInt(a.match(CRON_TIMESTAMPED_RE)![2]);
      const tsB = parseInt(b.match(CRON_TIMESTAMPED_RE)![2]);
      return tsA - tsB;
    });

    console.log(`Task: ${baseDir} (${dirs.length} old session(s))`);

    // Collect all messages from old sessions
    const allMessages: string[] = [];
    let earliestCreated = '';
    let latestUpdated = '';

    for (const dir of dirs) {
      const jsonlPath = path.join(SESSIONS_DIR, dir, `${dir}.jsonl`);
      const content = await fs.readFile(jsonlPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      const meta = JSON.parse(lines[0]) as SessionMeta;
      if (!earliestCreated || meta.createdAt < earliestCreated) earliestCreated = meta.createdAt;
      if (!latestUpdated || meta.updatedAt > latestUpdated) latestUpdated = meta.updatedAt;

      // Collect message lines (skip header)
      for (let i = 1; i < lines.length; i++) {
        allMessages.push(lines[i]);
      }
    }

    // Build the new persistent session key from the old one
    // Old sessionKey: "cron:<taskId>:<timestamp>" → extract taskId
    const samplePath = path.join(SESSIONS_DIR, dirs[0], `${dirs[0]}.jsonl`);
    const sampleContent = await fs.readFile(samplePath, 'utf-8');
    const sampleMeta = JSON.parse(sampleContent.split('\n')[0]) as SessionMeta;
    const parts = sampleMeta.sessionKey.split(':');
    // cron:<taskId>:<timestamp> → taskId is parts[1]
    const taskId = parts[1];
    const newSessionKey = `cron:${taskId}`;

    // Build new session file
    const newMeta: SessionMeta = {
      sessionKey: newSessionKey,
      kind: 'cron',
      createdAt: earliestCreated,
      updatedAt: latestUpdated,
      metadata: sampleMeta.metadata ?? { taskId },
    };

    const newContent = [JSON.stringify(newMeta), ...allMessages].join('\n') + '\n';
    const newDir = path.join(SESSIONS_DIR, baseDir);
    const newFile = path.join(newDir, `${baseDir}.jsonl`);

    console.log(`  → Merging ${allMessages.length} messages into ${newSessionKey}`);

    if (!DRY_RUN) {
      // Check if target already exists (from a previous partial migration)
      const targetExists = await fs.stat(newFile).then(() => true).catch(() => false);
      if (targetExists) {
        // Append messages to existing
        const existing = await fs.readFile(newFile, 'utf-8');
        const existingLines = existing.trim().split('\n').filter(Boolean);
        const mergedContent = [existingLines[0], ...existingLines.slice(1), ...allMessages].join('\n') + '\n';
        await fs.writeFile(newFile, mergedContent, 'utf-8');
      } else {
        await fs.mkdir(newDir, { recursive: true });
        await fs.writeFile(newFile, newContent, 'utf-8');
      }

      // Delete old dirs
      for (const dir of dirs) {
        await fs.rm(path.join(SESSIONS_DIR, dir), { recursive: true, force: true });
      }
      totalDeleted += dirs.length;
    }

    totalMerged++;
  }

  console.log(`\n${DRY_RUN ? 'Would merge' : 'Merged'}: ${totalMerged} task(s), deleted ${totalDeleted} old session dir(s)`);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
