/**
 * Edge service discovery — scans `edge/<name>/index.<ext>` for external-facing
 * protocol bridges (MCP server, webhooks). Edge services are loaded after core
 * services so the bus is fully wired before they start.
 *
 * Spec names are prefixed with `edge-` to avoid collisions with core services
 * (e.g. `edge/mcp` → spec name `edge-mcp` vs `services/mcp` → `mcp`).
 */

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ServiceSpec } from './loader.js';
import { DEFAULT_BOOT_PRIORITY } from './services.js';

/** Names of edge services present on disk, sorted. */
export function discoverEdgeServiceNames(rootDir: string, ext: 'ts' | 'js'): string[] {
  const edgeDir = path.join(rootDir, 'edge');
  let names: string[] = [];
  try {
    names = readdirSync(edgeDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && existsSync(path.join(edgeDir, e.name, `index.${ext}`)))
      .map(e => e.name)
      .sort();
  } catch { /* no edge dir */ }
  return names;
}

/** Resolve an edge service name to its on-disk module, or null if absent. */
export function resolveEdgeService(name: string, rootDir: string, ext: 'ts' | 'js'): ServiceSpec | null {
  const modulePath = path.join(rootDir, 'edge', name, `index.${ext}`);
  return existsSync(modulePath) ? { name: `edge-${name}`, modulePath, priority: DEFAULT_BOOT_PRIORITY } : null;
}

/** Every discovered edge service as a load spec, sorted by BOOT_PRIORITY. */
export async function discoverEdgeServices(rootDir: string, ext: 'ts' | 'js'): Promise<ServiceSpec[]> {
  const names = discoverEdgeServiceNames(rootDir, ext);
  const specs: ServiceSpec[] = [];
  for (const name of names) {
    const modulePath = path.join(rootDir, 'edge', name, `index.${ext}`);
    if (!existsSync(modulePath)) continue;
    const mod = await import(modulePath) as { BOOT_PRIORITY?: number };
    const priority = mod.BOOT_PRIORITY ?? DEFAULT_BOOT_PRIORITY;
    specs.push({ name: `edge-${name}`, modulePath, priority });
  }
  return specs.sort((a, b) => a.priority - b.priority);
}
