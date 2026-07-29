import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ServiceSpec } from './loader.js';

// Convention: a service is any `services/<name>/index.<ext>`. The directory name IS
// the service name and method namespace (e.g. services/channel → channel.send). No
// manifest — drop a folder in and it loads. `edge/*` is intentionally NOT auto-loaded
// here — see core/edges.ts for edge service discovery.

/** Each service module may export `BOOT_PRIORITY` (lower = earlier). Default 0. */
export const DEFAULT_BOOT_PRIORITY = 0;

/** Names of all services present on disk (directory basenames), sorted alphabetically. */
export function discoverServiceNames(rootDir: string, ext: 'ts' | 'js'): string[] {
  const servicesDir = path.join(rootDir, 'services');
  let names: string[] = [];
  try {
    names = readdirSync(servicesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(path.join(servicesDir, e.name, `index.${ext}`)))
      .map(e => e.name)
      .sort();
  } catch { /* no services dir */ }
  return names;
}

/** Resolve a service name to its on-disk module, or null if absent. */
export function resolveService(name: string, rootDir: string, ext: 'ts' | 'js'): ServiceSpec | null {
  const modulePath = path.join(rootDir, 'services', name, `index.${ext}`);
  return existsSync(modulePath) ? { name, modulePath, priority: DEFAULT_BOOT_PRIORITY } : null;
}

/** Every discovered service as a load spec, sorted by BOOT_PRIORITY (lower = earlier). */
export async function discoverServices(rootDir: string, ext: 'ts' | 'js'): Promise<ServiceSpec[]> {
  const names = discoverServiceNames(rootDir, ext);
  const specs: ServiceSpec[] = [];
  for (const name of names) {
    const modulePath = path.join(rootDir, 'services', name, `index.${ext}`);
    if (!existsSync(modulePath)) continue;
    // Import to read BOOT_PRIORITY — ESM caches the module so loader.load() won't re-execute.
    const mod = await import(modulePath) as { BOOT_PRIORITY?: number };
    const priority = mod.BOOT_PRIORITY ?? DEFAULT_BOOT_PRIORITY;
    specs.push({ name, modulePath, priority });
  }
  return specs.sort((a, b) => a.priority - b.priority);
}

