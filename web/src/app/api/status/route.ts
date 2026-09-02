import { NextResponse } from "next/server";
import { isGatewayOnline, rpcCall, gatewayEndpoint } from "../../../server/rpc";
import { normalizeAgent, normalizeServices } from "../../../server/normalize";
import type { ChannelConfig, MemoryStats, StatusPayload } from "../../../lib/types";
import { ensureWsServer } from "../../../server/ws-server";

export const dynamic = "force-dynamic";

/**
 * Combined live state of the running vargos gateway. Everything comes over RPC;
 * when the daemon's RPC server isn't up yet the live sections are null.
 */
export async function GET() {
  await ensureWsServer();
  const { host, port } = gatewayEndpoint();
  const online = await isGatewayOnline();

  const payload: StatusPayload = {
    gateway: { host, port, online },
    services: null,
    agent: null,
    memory: null,
  };
  let configuredChannels: ChannelConfig[] = [];

  if (online) {
    try {
      payload.services = normalizeServices(await rpcCall<unknown>("bus.status"));
    } catch {
      /* partial */
    }
    try {
      payload.agent = normalizeAgent(await rpcCall<unknown>("agent.status"));
    } catch {
      /* partial */
    }
    try {
      payload.memory = await rpcCall<MemoryStats>("memory.stats");
    } catch {
      /* partial */
    }
    try {
      const cfg = await rpcCall<{ channels?: ChannelConfig[] }>("config.get", {});
      configuredChannels = cfg.channels ?? [];
    } catch {
      /* partial */
    }
  }

  return NextResponse.json({ ...payload, configuredChannels });
}
