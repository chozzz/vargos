import { NextResponse } from "next/server";
import { loadTranscript } from "../../../../server/loaders";
import { ensureWsServer } from "../../../../server/ws-server";

export const dynamic = "force-dynamic";

/**
 * Parse one session transcript: `?path=cli/2026-....jsonl` (path relative to the
 * sessions dir) → normalized events exactly as stored in the JSONL.
 */
export async function GET(req: Request) {
  await ensureWsServer();
  const { searchParams } = new URL(req.url);
  const relPath = searchParams.get("path");
  if (!relPath) {
    return NextResponse.json({ error: "missing ?path=" }, { status: 400 });
  }
  const transcript = await loadTranscript(relPath);
  if (!transcript) {
    return NextResponse.json({ error: "session file not found" }, { status: 404 });
  }
  return NextResponse.json(transcript);
}
