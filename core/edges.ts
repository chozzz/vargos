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
  return existsSync(modulePath) ? { name: `edge-${name}`, modulePath } : null;
}

/** Every discovered edge service as a load spec. */
export function discoverEdgeServices(rootDir: string, ext: 'ts' | 'js'): ServiceSpec[] {
  return discoverEdgeServiceNames(rootDir, ext)
    .map(name => resolveEdgeService(name, rootDir, ext)!)
    .filter(Boolean);
}
