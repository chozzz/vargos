"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessagesSquare, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ChannelSessions, SessionFile } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/hud/page-header";
import { Panel } from "@/components/hud/panel";
import { SectionError, EmptyState } from "@/components/hud/states";

const PAGE_SIZE = 12;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 16).replace("T", " ");
}

function matches(f: SessionFile, q: string): boolean {
  if (!q) return true;
  const hay = [
    f.file,
    f.lastModel ?? "",
    f.chatId ?? "",
    f.subagentId ?? "",
    fmtDate(f.startedAt),
    f.subagentId ? "subagent" : f.chatId ? "chat" : "root",
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

function ChannelPanel({
  c,
  query,
  onOpen,
}: {
  c: ChannelSessions;
  query: string;
  onOpen: (f: SessionFile) => void;
}) {
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => c.files.filter((f) => matches(f, query)), [c.files, query]);

  useEffect(() => setPage(0), [query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, pages - 1);
  const start = clamped * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  if (query && filtered.length === 0) return null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {c.channel}
          <Badge variant="outline" className="font-mono text-[10px] normal-case">
            {query ? `${filtered.length} / ${c.fileCount}` : `${c.fileCount} sessions`}
          </Badge>
          <span className="text-muted-foreground/70">{fmtBytes(c.totalBytes)}</span>
        </span>
      }
      icon={<MessagesSquare />}
      bodyClassName="p-0"
    >
      <Table className="hud-table">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Started</TableHead>
            <TableHead>Session file</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Msgs</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((f) => (
            <TableRow key={f.path} className="group cursor-pointer" onClick={() => onOpen(f)}>
              <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                {fmtDate(f.startedAt)}
              </TableCell>
              <TableCell className="max-w-72 truncate font-mono text-xs">{f.file}</TableCell>
              <TableCell>
                {f.subagentId ? (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    subagent:{f.subagentId}
                  </Badge>
                ) : f.chatId ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    chat:{f.chatId}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    root
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {f.lastModel ?? "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {f.messageCount}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                {fmtBytes(f.sizeBytes)}
              </TableCell>
              <TableCell className="pr-3 text-right">
                <ChevronRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 font-mono text-[11px] text-muted-foreground">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={clamped === 0}
              onClick={() => setPage(clamped - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="tabular-nums">
              {clamped + 1} / {pages}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={clamped >= pages - 1}
              onClick={() => setPage(clamped + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function SessionsPage() {
  const [channels, setChannels] = useState<ChannelSessions[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await api.sessions();
      setChannels(res.channels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const open = (f: SessionFile) =>
    router.push(`/sessions/view?path=${encodeURIComponent(f.path)}`);

  const totalMatches = useMemo(
    () =>
      (channels ?? []).reduce(
        (n, c) => n + c.files.filter((f) => matches(f, query)).length,
        0,
      ),
    [channels, query],
  );

  const header = (
    <PageHeader
      eyebrow="Transcripts"
      title="Sessions"
      description={
        <>
          JSONL transcripts under{" "}
          <code className="font-mono">~/.vargos/sessions/&lt;channel&gt;/</code> — refreshed
          live as the daemon appends.
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to list sessions: ${error}`} />
      </>
    );
  }
  if (!channels) {
    return (
      <>
        {header}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter by file, model, scope, date…  (space-separated terms)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {query && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {totalMatches} match{totalMatches === 1 ? "" : "es"}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {channels.length === 0 && (
          <EmptyState icon={<MessagesSquare />} message="No session directories found." />
        )}
        {query && totalMatches === 0 && channels.length > 0 && (
          <EmptyState icon={<Search />} message={`Nothing matches "${query}".`} />
        )}
        {channels.map((c) => (
          <ChannelPanel key={c.channel} c={c} query={query} onOpen={open} />
        ))}
      </div>
    </>
  );
}
