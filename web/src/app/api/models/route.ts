import { NextResponse } from "next/server";
import { rpcCall } from "../../../server/rpc";
import { ensureWsServer } from "../../../server/ws-server";
import type { ModelProvider, ProviderConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

/** Model providers — the daemon's merged `config.providers`, flattened to a list. */
export async function GET() {
  await ensureWsServer();
  const cfg = await rpcCall<{ providers?: Record<string, ProviderConfig> }>("config.get", {});
  const providers: ModelProvider[] = Object.entries(cfg.providers ?? {}).map(([key, p]) => ({
    key,
    baseUrl: p.baseUrl ?? null,
    api: p.api ?? null,
    models: (p.models ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      input: m.input ?? [],
      contextWindow: m.contextWindow ?? null,
      maxTokens: m.maxTokens ?? null,
      cost: (m.cost ?? {}) as Record<string, number>,
    })),
  }));
  return NextResponse.json({ providers });
}
