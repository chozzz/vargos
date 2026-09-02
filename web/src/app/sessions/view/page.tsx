"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Cpu,
  Terminal,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Transcript, TranscriptEvent, TranscriptMessage } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/hud/page-header";
import { Panel } from "@/components/hud/panel";
import { SectionError, EmptyState } from "@/components/hud/states";
import { cn } from "@/lib/utils";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; thinkingSignature?: string }
  | { type: "toolCall"; id: string; name: string; arguments?: unknown }
  | { type: "image"; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border/70 bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function BlockView({ block, mono }: { block: ContentBlock; mono?: boolean }) {
  switch (block.type) {
    case "text":
      return mono ? (
        <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {String(block.text)}
        </pre>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{String(block.text)}</p>
      );
    case "thinking":
      return (
        <details className="group rounded-md border border-border/70 bg-muted/30 p-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 font-mono tracking-wide text-muted-foreground uppercase select-none">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            thinking
          </summary>
          <CodeBlock>{String(block.thinking)}</CodeBlock>
        </details>
      );
    case "toolCall":
      return (
        <details className="group rounded-md border border-primary/25 bg-primary/5 p-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 select-none">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            <Wrench className="size-3 text-primary" />
            <span className="font-mono font-medium text-primary">{String(block.name)}</span>
            <span className="text-muted-foreground">tool call</span>
          </summary>
          <CodeBlock>{JSON.stringify(block.arguments ?? {}, null, 2)}</CodeBlock>
        </details>
      );
    default:
      return <CodeBlock>{JSON.stringify(block, null, 2)}</CodeBlock>;
  }
}

const ROLE_STYLES: Record<string, string> = {
  user: "border-l-primary/70 bg-primary/[0.04]",
  assistant: "border-l-border bg-card/50",
  toolResult: "border-l-accent/60 bg-muted/25",
};

function MessageView({ msg }: { msg: TranscriptMessage }) {
  const content: unknown = msg.content;
  const blocks: ContentBlock[] = Array.isArray(content)
    ? (content as ContentBlock[])
    : content != null
      ? [{ type: "text", text: String(content) }]
      : [];

  const isTool = msg.role === "toolResult";
  const toolName = isTool ? (msg.raw.toolName as string | undefined) : undefined;
  const label = isTool && toolName ? `tool result · ${toolName}` : msg.role;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 border-l-2 p-3",
        ROLE_STYLES[msg.role] ?? "border-l-border bg-card/50",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] tracking-wide text-foreground uppercase">
          {label}
        </span>
        {msg.model && (
          <span className="font-mono text-[11px] text-muted-foreground">{msg.model}</span>
        )}
        {msg.stopReason && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {msg.stopReason}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70 tabular-nums">
          {new Date(msg.at).toISOString().slice(11, 19)}
        </span>
      </div>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} mono={isTool} />
        ))}
      </div>
    </div>
  );
}

function Marker({
  label,
  value,
  at,
}: {
  label: string;
  value: string;
  at: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 text-[11px] text-muted-foreground">
      <span className="h-px flex-1 bg-border/60" />
      <span className="font-mono tracking-wide uppercase">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
      <span className="font-mono tabular-nums">{at.slice(11, 19)}</span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

function EventRow({ ev }: { ev: TranscriptEvent }) {
  if (ev.kind === "message") return <MessageView msg={ev} />;
  if (ev.kind === "model_change")
    return <Marker label="model" value={`${ev.provider}/${ev.modelId}`} at={ev.at} />;
  if (ev.kind === "thinking_level_change")
    return <Marker label="thinking" value={ev.thinkingLevel} at={ev.at} />;
  if (ev.kind === "session") return null;
  return (
    <div className="flex items-center gap-2 px-1 font-mono text-[11px] text-muted-foreground">
      <Badge variant="outline" className="text-[10px]">
        {ev.type}
      </Badge>
      <span className="truncate">{JSON.stringify(ev.raw).slice(0, 120)}</span>
    </div>
  );
}

export default function SessionViewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SessionViewInner />
    </Suspense>
  );
}

function SessionViewInner() {
  const searchParams = useSearchParams();
  const relPath = searchParams.get("path");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!relPath) return;
    api
      .transcript(relPath)
      .then(setTranscript)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [relPath]);

  const header = useMemo(
    () => transcript?.events.find((e) => e.kind === "session"),
    [transcript],
  );

  const backLink = (
    <Link
      href="/sessions"
      className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Sessions
    </Link>
  );

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Transcript" title="Session" actions={backLink} />
        <SectionError message={`Failed to load transcript: ${error}`} />
      </>
    );
  }
  if (!transcript) {
    return (
      <>
        <PageHeader eyebrow="Transcript" title="Session" actions={backLink} />
        <Skeleton className="h-96 rounded-xl" />
      </>
    );
  }

  const sessionHeader = header && header.kind === "session" ? header : null;
  const messageCount = transcript.events.filter((e) => e.kind === "message").length;

  return (
    <>
      <PageHeader
        eyebrow="Transcript"
        title={transcript.file}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <Badge variant="outline" className="text-[10px]">
              {transcript.channel}
            </Badge>
            {transcript.chatId && (
              <Badge variant="outline" className="text-[10px]">
                chat:{transcript.chatId}
              </Badge>
            )}
            {transcript.subagentId && (
              <Badge variant="secondary" className="text-[10px]">
                subagent:{transcript.subagentId}
              </Badge>
            )}
            {sessionHeader && (
              <span className="text-muted-foreground">
                id {sessionHeader.id} · {sessionHeader.startedAt} · {sessionHeader.cwd}
              </span>
            )}
          </span>
        }
        actions={backLink}
      />

      <Panel
        title={`transcript · ${transcript.events.length} events · ${messageCount} messages`}
        icon={<Terminal />}
      >
        {transcript.events.length === 0 ? (
          <EmptyState icon={<Cpu />} message="No events in this session file." />
        ) : (
          <div className="space-y-3">
            {transcript.events.map((ev, i) => (
              <EventRow key={i} ev={ev} />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
