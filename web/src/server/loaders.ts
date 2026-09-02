/**
 * Filesystem readers for the two things with no bus method: session transcripts
 * (Pi SDK owns the JSONL format) and persona files (`~/.vargos/agents/*.md`).
 * Everything else the console shows comes from the daemon over RPC.
 */

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Transform } from "node:stream";
import path from "node:path";
import { getDataPaths } from "@vargos/lib/paths";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";
import type {
  AgentPersona,
  ChannelSessions,
  SessionFile,
  Transcript,
  TranscriptEvent,
} from "../lib/types";

async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

// ── agents/*.md ───────────────────────────────────────────────────────────────

export async function listAgentPersonas(): Promise<AgentPersona[]> {
  const { agentsDir } = getDataPaths();
  const names = await listDir(agentsDir);
  const out: AgentPersona[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(agentsDir, name), "utf8").catch(() => null);
    if (raw === null) continue;
    const parsed = parseFrontmatter<Record<string, unknown>>(raw);
    out.push({ file: name, meta: parsed?.meta ?? {}, body: parsed?.body ?? raw });
  }
  return out;
}

/**
 * Write a persona file to `~/.vargos/agents/<file>`. `file` must be a plain
 * `<name>.md` basename — no path traversal. Frontmatter is serialised via the
 * shared vargos serializer so it round-trips with what the daemon reads.
 */
export async function saveAgentPersona(
  file: string,
  meta: Record<string, unknown>,
  body: string,
): Promise<void> {
  if (!/^[a-z0-9._-]+\.md$/i.test(file) || file.includes("..")) {
    throw new Error(`invalid persona filename: ${file}`);
  }
  const { agentsDir } = getDataPaths();
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.writeFile(
    path.join(agentsDir, file),
    serializeFrontmatter(meta ?? {}, (body ?? "").trim()),
    "utf8",
  );
}

// ── sessions/<channel>/... *.jsonl ───────────────────────────────────────────

/** Read the first line (session header) + count messages + last model change. */
async function summarizeSessionFile(
  absPath: string,
  relPath: string,
  channel: string,
  chatId: string | null,
  subagentId: string | null,
): Promise<SessionFile> {
  const st = await fs.stat(absPath);
  let startedAt: string | null = null;
  let messageCount = 0;
  let lastModel: string | null = null;

  // Stream-count message lines — a full in-memory scan is too heavy for the
  // larger session files. (Static imports: a dynamic `import("node:stream")` gets
  // mangled in the Next production server bundle.)
  await new Promise<void>((resolve, reject) => {
    let buf = "";
    let headerDone = false;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        buf += chunk.toString();
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          if (!headerDone) {
            try {
              const d = JSON.parse(line) as { type?: string; timestamp?: string };
              if (d.type === "session") {
                startedAt = d.timestamp ?? null;
                headerDone = true;
              }
            } catch {
              headerDone = true;
            }
          }
          if (line.includes('"type":"message"')) messageCount++;
          const mc = line.match(/"type":"model_change","[^}]*?"provider":"([^"]+)","modelId":"([^"]+)"/);
          if (mc) lastModel = `${mc[1]}/${mc[2]}`;
        }
        cb();
      },
    });
    createReadStream(absPath)
      .pipe(counter)
      .on("data", () => undefined)
      .on("end", () => resolve())
      .on("error", reject);
  });

  return {
    file: path.basename(absPath),
    path: relPath,
    channel,
    chatId,
    subagentId,
    sizeBytes: st.size,
    mtimeMs: st.mtimeMs,
    startedAt,
    messageCount,
    lastModel,
  };
}

/**
 * Recursively collect .jsonl files under a channel dir. Structure observed in the
 * live data dir:
 *   sessions/<channel>/*.jsonl                    (flat, e.g. cli, cron)
 *   sessions/<channel>/<chatId>/*.jsonl           (chat-scoped, e.g. telegram-*)
 *   sessions/<channel>/<chatId>/subagent/<id>/*.jsonl
 */
async function collectChannelFiles(
  dir: string,
  relPrefix: string,
  channel: string,
  chatId: string | null,
  subagentId: string | null,
  out: SessionFile[],
): Promise<void> {
  const entries = await listDir(dir);
  for (const name of entries) {
    const abs = path.join(dir, name);
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    const st = await fs.lstat(abs).catch(() => null);
    if (!st) continue;
    if (st.isFile()) {
      if (name.endsWith(".jsonl")) {
        out.push(await summarizeSessionFile(abs, rel, channel, chatId, subagentId));
      }
    } else if (st.isDirectory()) {
      if (name === "subagent" && chatId) {
        const subIds = await listDir(abs);
        for (const subId of subIds) {
          await collectChannelFiles(
            path.join(abs, subId),
            rel + "/subagent/" + subId,
            channel,
            chatId,
            subId,
            out,
          );
        }
      } else {
        const files = await listDir(abs);
        for (const f of files) {
          if (!f.endsWith(".jsonl")) continue;
          out.push(
            await summarizeSessionFile(
              path.join(abs, f),
              rel + "/" + f,
              channel,
              chatId ?? name,
              subagentId,
            ),
          );
        }
      }
    }
  }
}

export async function listChannelSessions(channel?: string): Promise<ChannelSessions[]> {
  const { sessionsDir } = getDataPaths();
  const channels = channel ? [channel] : await listDir(sessionsDir);

  const out: ChannelSessions[] = [];
  for (const c of channels) {
    const dir = path.join(sessionsDir, c);
    try {
      await fs.access(dir);
    } catch {
      continue;
    }
    const files: SessionFile[] = [];
    await collectChannelFiles(dir, c, c, null, null, files);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    out.push({
      channel: c,
      fileCount: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      files,
    });
  }
  return out;
}

/** Parse a single session file into normalized events. */
export async function loadTranscript(relPath: string): Promise<Transcript | null> {
  const { sessionsDir } = getDataPaths();
  const parts = relPath.split("/");
  if (parts.length < 2) return null;

  const channel = parts[0];
  const chatId = parts[1] !== "subagent" ? parts[1] : null;
  const subagentId = parts.length >= 4 && parts[2] === "subagent" ? parts[3] : null;

  const abs = path.join(sessionsDir, relPath);
  const raw = await fs.readFile(abs, "utf8").catch(() => null);
  if (raw === null) return null;

  const events: TranscriptEvent[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(t);
    } catch {
      continue;
    }
    const at = typeof d.timestamp === "string" ? d.timestamp : "";
    switch (d.type) {
      case "session":
        events.push({
          kind: "session",
          id: String(d.id ?? ""),
          version: typeof d.version === "number" ? d.version : 0,
          startedAt: at,
          cwd: typeof d.cwd === "string" ? d.cwd : "",
        });
        break;
      case "model_change":
        events.push({
          kind: "model_change",
          provider: String(d.provider ?? ""),
          modelId: String(d.modelId ?? ""),
          at,
        });
        break;
      case "thinking_level_change":
        events.push({
          kind: "thinking_level_change",
          thinkingLevel: String(d.thinkingLevel ?? ""),
          at,
        });
        break;
      case "message": {
        const m = d.message as {
          role?: string;
          content?: unknown;
          provider?: string;
          model?: string;
          stopReason?: string;
          usage?: Record<string, number>;
        };
        events.push({
          kind: "message",
          role: m?.role ?? "unknown",
          content: m?.content,
          provider: m?.provider,
          model: m?.model,
          stopReason: m?.stopReason,
          usage: m?.usage,
          at,
          raw: d,
        });
        break;
      }
      default:
        events.push({ kind: "other", type: String(d.type ?? "unknown"), raw: d });
    }
  }

  return { channel, chatId, subagentId, file: parts[parts.length - 1], events };
}
