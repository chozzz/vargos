import { NextResponse } from "next/server";
import { rpcCall } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";
import type { MemoryStats } from "../../../lib/types";

export const dynamic = "force-dynamic";

/** Memory index stats — straight from the daemon's `memory.stats`. */
export async function GET() {
  await ensureWsServer();
  const stats = await rpcCall<MemoryStats>("memory.stats", {});
  return NextResponse.json(stats);
}
