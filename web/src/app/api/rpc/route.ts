import { NextResponse } from "next/server";
import { rpcCall } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";

export const dynamic = "force-dynamic";

/**
 * POST proxy to the running vargos gateway. The method allow-list keeps the UI
 * limited to safe, known bus methods.
 */
const WRITABLE = new Set([
  "bus.restart",
  "bus.restartProcess",
  "channel.restart",
  "channel.register",
  "channel.unregister",
  "channel.pairStart",
  "channel.pairStatus",
  "channel.pairCancel",
  "channel.send",
  "config.get",
  "config.set",
  "cron.add",
  "cron.update",
  "cron.remove",
  "cron.run",
  "memory.search",
  "memory.reindex",
]);

interface RpcRequest {
  method?: string;
  params?: unknown;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({})) as RpcRequest);
  if (!body.method || !WRITABLE.has(body.method)) {
    return NextResponse.json(
      { ok: false, error: `method not allowed: ${body.method ?? "(missing)"}` },
      { status: 400 },
    );
  }

  await ensureWsServer();

  try {
    const result = await rpcCall(body.method, body.params ?? {});
    return NextResponse.json({ ok: true, result: result ?? null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
