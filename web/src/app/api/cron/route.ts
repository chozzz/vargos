import { NextResponse } from "next/server";
import { rpcCall, rows } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";
import type { CronTask } from "../../../lib/types";

export const dynamic = "force-dynamic";

/** Scheduled cron tasks — straight from the daemon's `cron.list`. */
export async function GET() {
  await ensureWsServer();
  const jobs = rows<CronTask>(await rpcCall("cron.list", {}));
  return NextResponse.json({ jobs });
}
