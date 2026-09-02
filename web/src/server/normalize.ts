/**
 * Normalizers for the raw gateway RPC results, so the web client can always
 * rely on a consistent shape.
 */

import type { ServiceStatus } from "../lib/types";

/**
 * `bus.status` returns `{ services: [...] }`, but the UI expects `status.services`
 * to be the array itself. Unwrap the nested object (and tolerate a bare array).
 */
export function normalizeServices(result: unknown): ServiceStatus[] | null {
  if (Array.isArray(result)) return result as ServiceStatus[];
  if (result && typeof result === "object") {
    const inner = (result as { services?: unknown }).services;
    if (Array.isArray(inner)) return inner as ServiceStatus[];
  }
  return null;
}

/**
 * `agent.status` returns `{ sessions: [...], activeRuns: [...] }`. The UI expects
 * `status.agent.sessions` to be the session array. Unwrap if needed.
 */
export function normalizeAgent(result: unknown): Record<string, unknown> | null {
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    // ensure `sessions` is always an array
    if (r.sessions !== undefined && !Array.isArray(r.sessions)) {
      r.sessions = [];
    }
    if (r.activeRuns !== undefined && !Array.isArray(r.activeRuns)) {
      r.activeRuns = [];
    }
    return r;
  }
  return null;
}
