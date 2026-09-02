import { NextResponse } from "next/server";
import { rpcCall, rows } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";
import type { ChannelConfig, ChannelStatus, ChannelsPayload } from "../../../lib/types";

export const dynamic = "force-dynamic";

/**
 * Channel state, all from the daemon: configured entries from `config.get`,
 * merged with live `channel.list` status.
 */
export async function GET() {
  await ensureWsServer();
  const cfg = await rpcCall<{ channels?: ChannelConfig[] }>("config.get", {});
  let live: ChannelStatus[] | null = null;
  try {
    live = rows<ChannelStatus>(await rpcCall("channel.list", {}));
  } catch {
    live = null;
  }
  const payload: ChannelsPayload = { configured: cfg.channels ?? [], live };
  return NextResponse.json(payload);
}
