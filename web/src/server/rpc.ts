/**
 * Thin gateway client for the console's API routes — reuses the daemon's own
 * `RpcClient` (`core/rpc-client.ts`) so there's one implementation of the
 * JSON-RPC-over-TCP protocol.
 */

import { RpcClient } from "@vargos/core/rpc-client";

/** $VARGOS_GATEWAY_HOST / $VARGOS_GATEWAY_PORT, else 127.0.0.1:9000. */
export function gatewayEndpoint(): { host: string; port: number } {
  return {
    host: process.env.VARGOS_GATEWAY_HOST || "127.0.0.1",
    port: parseInt(process.env.VARGOS_GATEWAY_PORT || "9000", 10),
  };
}

export function rpcCall<T = unknown>(method: string, params?: unknown): Promise<T> {
  const { host, port } = gatewayEndpoint();
  return new RpcClient(host, port).call<T>(method, params);
}

/** Unwrap a `filterPaginate` result (`{ items, page, limit, total }`) or a bare array. */
export function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const items = (result as { items?: unknown })?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

export async function isGatewayOnline(): Promise<boolean> {
  try {
    await rpcCall("bus.list", {});
    return true;
  } catch {
    return false;
  }
}
