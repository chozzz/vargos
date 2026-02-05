/**
 * Heartbeat runner — periodically checks HEARTBEAT.md and runs the agent
 * if there are pending tasks. Skips when file is empty (saves API cost).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPiAgentRuntime } from '../agent/runtime.js';
import { resolveSessionFile, resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Returns true if HEARTBEAT.md has no actionable content —
 * only headers, HTML comments, horizontal rules, empty list markers, or whitespace.
 */
export function isHeartbeatEmpty(content: string): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;
    if (trimmed === '---') continue;
    if (trimmed === '-' || trimmed === '*') continue;
    return false;
  }
  return true;
}

/**
 * Read HEARTBEAT.md from workspace. Returns empty string if missing.
 */
async function readHeartbeat(workspaceDir: string): Promise<string> {
  try {
    return await fs.readFile(path.join(workspaceDir, 'HEARTBEAT.md'), 'utf-8');
  } catch {
    return '';
  }
}

async function tick(workspaceDir: string): Promise<void> {
  const content = await readHeartbeat(workspaceDir);
  if (isHeartbeatEmpty(content)) return;

  const config = await loadConfig(resolveDataDir());
  if (!config) {
    console.error('[Heartbeat] No config.json — skipping');
    return;
  }
  const { provider, model } = config.agent;
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const apiKey = envKey || config.agent.apiKey;
  if (!apiKey) {
    console.error('[Heartbeat] No API key — skipping');
    return;
  }

  const ts = Date.now();
  const sessionKey = `heartbeat:${ts}`;
  const sessionFile = resolveSessionFile(sessionKey);
  const runtime = getPiAgentRuntime();

  const prompt = [
    'Heartbeat poll. Check HEARTBEAT.md for pending tasks.',
    'If nothing needs attention, reply with exactly: HEARTBEAT_OK',
    '',
    '--- HEARTBEAT.md ---',
    content,
  ].join('\n');

  try {
    // Store the task message so runtime picks it up
    const { getSessionService } = await import('../services/factory.js');
    const sessions = getSessionService();
    await sessions.create({
      sessionKey,
      kind: 'main',
      label: 'Heartbeat',
      metadata: { heartbeat: true },
    });
    await sessions.addMessage({
      sessionKey,
      content: prompt,
      role: 'user',
      metadata: { type: 'task' },
    });

    const result = await runtime.run({
      sessionKey,
      sessionFile,
      workspaceDir,
      model,
      provider,
      apiKey,
      baseUrl: config.agent.baseUrl,
    });

    if (result.success && result.response?.includes('HEARTBEAT_OK')) {
      console.error('[Heartbeat] OK — nothing to do');
    } else if (result.success) {
      console.error(`[Heartbeat] Response: ${result.response?.slice(0, 200)}`);
    } else {
      console.error(`[Heartbeat] Error: ${result.error}`);
    }
  } catch (err) {
    console.error('[Heartbeat] Error:', err instanceof Error ? err.message : err);
  }
}

export function startHeartbeat(workspaceDir: string, intervalMs = DEFAULT_INTERVAL_MS): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => tick(workspaceDir), intervalMs);
  // Unref so it doesn't keep the process alive on its own
  heartbeatTimer.unref();
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
