"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Database, FileText, RotateCw, Rows3 } from "lucide-react";
import { api } from "@/lib/api";
import type { MemoryStats } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/hud/page-header";
import { Panel } from "@/components/hud/panel";
import { StatTile } from "@/components/hud/stat-tile";
import { SectionError, EmptyState } from "@/components/hud/states";

interface MemHit {
  citation: string;
  score: number;
  content: string;
  startLine?: number;
  endLine?: number;
}

function MemorySearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MemHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await api.rpc("memory.search", { query: q.trim(), maxResults: 8 });
    setBusy(false);
    if (res.ok) {
      setHits((res.result as MemHit[] | null) ?? []);
    } else {
      setErr(res.error ?? "search failed");
      setHits(null);
    }
  };

  return (
    <Panel title="semantic search · memory.search" icon={<Search />}>
      <div className="flex gap-2">
        <Input
          placeholder="what did we decide about the GPU nodes?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void run();
          }}
        />
        <Button size="sm" onClick={run} disabled={busy || !q.trim()}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </div>

      {err && <p className="mt-3 text-xs text-destructive">{err}</p>}

      {hits && hits.length === 0 && (
        <EmptyState className="mt-3" icon={<Search />} message="No matches above the score threshold." />
      )}

      {hits && hits.length > 0 && (
        <div className="mt-3 space-y-2">
          {hits.map((h, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px]">
                <span className="text-primary">{h.citation}</span>
                {h.startLine != null && (
                  <span className="text-muted-foreground/70">
                    L{h.startLine}
                    {h.endLine && h.endLine !== h.startLine ? `–${h.endLine}` : ""}
                  </span>
                )}
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-muted-foreground tabular-nums">
                  {h.score.toFixed(3)}
                </span>
              </div>
              <p className="line-clamp-6 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {h.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function MemoryPage() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api.memory());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const reindex = async () => {
    setReindexing(true);
    const res = await api.rpc("memory.reindex", {});
    setReindexing(false);
    if (res.ok) {
      const r = res.result as { removed?: number; kept?: number } | null;
      toast.success(
        "Memory reindexed" +
          (r && typeof r.removed === "number"
            ? ` — removed ${r.removed} stale chunks, re-synced ${r.kept ?? 0} files`
            : ""),
      );
      void load();
    } else {
      toast.error(res.error ?? "Reindex failed");
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const reindexBtn = (
    <Button size="sm" variant="outline" disabled={reindexing} onClick={() => void reindex()}>
      <RotateCw className={reindexing ? "size-3.5 animate-spin" : "size-3.5"} />
      {reindexing ? "Reindexing…" : "Reindex"}
    </Button>
  );

  const header = (
    <PageHeader
      eyebrow="Store"
      title="Memory"
      description={
        <>
          Semantic index over <code className="font-mono">~/.vargos/memory/</code> — stats and
          search come straight from the daemon&apos;s <code className="font-mono">memory</code>{" "}
          service.
        </>
      }
      actions={reindexBtn}
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to load memory stats: ${error}`} />
      </>
    );
  }
  if (!stats) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-xl" />
      </>
    );
  }

  const indexed = stats.chunks > 0;
  const lastSync = stats.lastSync
    ? new Date(stats.lastSync).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "never";

  return (
    <>
      {header}
      <div className="mb-4">
        <MemorySearch />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Index"
          icon={<Database />}
          value={indexed ? "active" : "empty"}
          status={indexed ? "online" : "offline"}
        />
        <StatTile label="Files" icon={<FileText />} value={stats.files.toLocaleString()} />
        <StatTile label="Chunks" icon={<Rows3 />} value={stats.chunks.toLocaleString()} />
        <StatTile
          label="Last sync"
          icon={<Clock />}
          value={<span className="font-mono text-[13px]">{lastSync}</span>}
        />
      </div>
    </>
  );
}
