import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ServiceSpec } from './loader.js';

// Convention: a service is any `services/<name>/index.<ext>`. The directory name IS
// the service name and method namespace (e.g. services/channel → channel.send). No
// manifest — drop a folder in and it loads. `edge/*` is intentionally NOT auto-loaded
// here — see core/edges.ts for edge service discovery.

/** Services loaded before the rest, in this order — the only dependency the set has
 *  (others read config during init; logging wires early). Everything else follows,
 *  discovered and sorted. Adding a service requires no edit here. */
const LOAD_FIRST = ['config', 'log'];

/** Names of all services present on disk (directory basenames), ordered for loading. */
export function discoverServiceNames(rootDir: string, ext: 'ts' | 'js'): string[] {
  const servicesDir = path.join(rootDir, 'services');
  let names: string[] = [];
  try {
    names = readdirSync(servicesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(path.join(servicesDir, e.name, `index.${ext}`)))
      .map(e => e.name);
  } catch { /* no services dir */ }

  const rest = names.filter(n => !LOAD_FIRST.includes(n)).sort();
  const first = LOAD_FIRST.filter(n => names.includes(n));
  return [...first, ...rest];
}

/** Resolve a service name to its on-disk module, or null if absent. */
export function resolveService(name: string, rootDir: string, ext: 'ts' | 'js'): ServiceSpec | null {
  const modulePath = path.join(rootDir, 'services', name, `index.${ext}`);
  return existsSync(modulePath) ? { name, modulePath } : null;
}

/** Every discovered service as a load spec, in load order. */
export function discoverServices(rootDir: string, ext: 'ts' | 'js'): ServiceSpec[] {
  return discoverServiceNames(rootDir, ext).map(name => resolveService(name, rootDir, ext)!);
}

