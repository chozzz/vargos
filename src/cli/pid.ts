import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveDataDir } from '../config/paths.js';

export async function readGatewayPid(): Promise<number | null> {
  try {
    const pidFile = path.join(resolveDataDir(), 'vargos.pid');
    const pid = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

export function waitForExit(pid: number, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      try {
        process.kill(pid, 0);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 100);
      } catch { resolve(true); }
    };
    check();
  });
}
