"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronRight, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { AgentPersona } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/hud/page-header";
import { Panel } from "@/components/hud/panel";
import { SectionError, EmptyState } from "@/components/hud/states";
import { AgentForm } from "@/components/forms/agent-form";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentPersona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AgentPersona | null>(null);

  const load = useCallback(async () => {
    try {
      setAgents((await api.agents()).agents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const header = (
    <PageHeader
      eyebrow="Personas"
      title="Agents"
      description={
        <>
          Per-channel system-prompt overrides from{" "}
          <code className="font-mono">~/.vargos/agents/*.md</code> — frontmatter plus a body
          appended to the prompt.
        </>
      }
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          New persona
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to load agent personas: ${error}`} />
      </>
    );
  }
  if (!agents) {
    return (
      <>
        {header}
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const open = agents.find((a) => a.file === openFile) ?? null;

  return (
    <>
      {header}
      {agents.length === 0 && (
        <EmptyState icon={<Bot />} message="No agent personas found." />
      )}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const allowedTools = a.meta.allowedTools;
          const tools = Array.isArray(allowedTools) ? (allowedTools as string[]) : null;
          const isOpen = openFile === a.file;
          return (
            <Panel key={a.file} title={a.file.replace(/\.md$/, "")} icon={<Bot />}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={tools && tools.length === 0 ? "secondary" : "outline"}
                  className="font-mono text-[10px]"
                >
                  {tools === null
                    ? "all tools"
                    : tools.length === 0
                      ? "no tools"
                      : `${tools.length} tools`}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {fmtBytes(a.body.length)}
                </span>
              </div>
              {tools && tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tools.map((t) => (
                    <Badge key={t} variant="outline" className="font-mono text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{a.body}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-primary uppercase transition-opacity hover:opacity-70"
                  onClick={() => setOpenFile(isOpen ? null : a.file)}
                >
                  <ChevronRight
                    className={`size-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                  {isOpen ? "hide body" : "view body"}
                </button>
                <button
                  className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
                  onClick={() => {
                    setEditing(a);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="size-3" />
                  edit
                </button>
              </div>
            </Panel>
          );
        })}
      </div>

      {open && (
        <div className="mt-4">
          <Panel title={open.file} icon={<Bot />}>
            <pre className="max-h-[28rem] overflow-auto rounded-md border border-border/70 bg-background/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {open.body}
            </pre>
          </Panel>
        </div>
      )}

      <AgentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        persona={editing}
        onSaved={load}
      />
    </>
  );
}
