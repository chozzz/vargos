import { NextResponse } from "next/server";
import { listAgentPersonas, saveAgentPersona } from "../../../server/loaders";
import { ensureWsServer } from "../../../server/ws-server";

export const dynamic = "force-dynamic";

/** Per-channel persona files from `~/.vargos/agents/*.md` (frontmatter + body). */
export async function GET() {
  await ensureWsServer();
  const agents = await listAgentPersonas();
  return NextResponse.json({ agents });
}

/** Create / overwrite a persona file. Body: { file, meta?, body }. */
export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    file?: string;
    meta?: Record<string, unknown>;
    body?: string;
  };
  if (!b.file || typeof b.body !== "string") {
    return NextResponse.json({ ok: false, error: "file and body are required" }, { status: 400 });
  }
  try {
    await saveAgentPersona(b.file, b.meta ?? {}, b.body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
