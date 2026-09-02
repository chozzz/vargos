import { NextResponse } from "next/server";
import { listChannelSessions } from "../../../server/loaders";
import { ensureWsServer } from "../../../server/ws-server";

export const dynamic = "force-dynamic";

/** List session transcripts per channel, read straight from `~/.vargos/sessions/`. */
export async function GET(req: Request) {
  await ensureWsServer();
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") ?? undefined;
  const channels = await listChannelSessions(channel);
  return NextResponse.json({ channels });
}
