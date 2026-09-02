import { NextResponse } from "next/server";
import { rpcCall } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";
import type { McpServer } from "../../../lib/types";

export const dynamic = "force-dynamic";

/** MCP servers with live connection status — straight from the daemon's `mcp.list`. */
export async function GET() {
  await ensureWsServer();
  const servers = await rpcCall<McpServer[]>("mcp.list", {});
  return NextResponse.json({ servers: servers ?? [] });
}
