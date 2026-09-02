"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Pencil, Play, Plus, Timer, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CronTask } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Button } from "@/components/ui/button";
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
import { StatusDot } from "@/components/hud/status-dot";
import { SectionError, EmptyState } from "@/components/hud/states";
import { CronForm } from "@/components/forms/cron-form";

export default function CronPage() {
  const [jobs, setJobs] = useState<CronTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CronTask | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs((await api.cron()).jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const runJob = async (id: string) => {
    if (!id) {
      toast.error("This job has no id to trigger.");
      return;
    }
    setRunningId(id);
    const res = await api.rpc("cron.run", { id });
    setRunningId(null);
    if (res.ok) {
      toast.success(`"${id}" triggered — the agent run starts in the daemon.`);
      setTimeout(() => void load(), 4000);
    } else {
      toast.error(res.error ?? `Could not trigger "${id}"`);
    }
  };

  const removeJob = async (j: CronTask) => {
    if (!j.id) return;
    if (!confirm(`Delete cron job "${j.name}" (${j.id})?`)) return;
    const res = await api.rpc("cron.remove", { id: j.id });
    if (res.ok) {
      toast.success(`Deleted "${j.name}".`);
      void load();
    } else {
      toast.error(res.error ?? "Delete failed");
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const header = (
    <PageHeader
      eyebrow="Automation"
      title="Cron"
      description={
        <>
          Jobs in <code className="font-mono">~/.vargos/cron/*.md</code> — YAML frontmatter
          schedules the run; the body is the prompt.
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
          New job
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to load cron jobs: ${error}`} />
      </>
    );
  }
  if (!jobs) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-xl" />
      </>
    );
  }

  const open = jobs.find((j) => j.id === openId) ?? null;

  return (
    <>
      {header}
      <Panel title={`cron jobs · ${jobs.length}`} icon={<Timer />} bodyClassName="p-0">
        {jobs.length === 0 ? (
          <EmptyState icon={<Timer />} message="No cron jobs yet — create one." />
        ) : (
          <Table className="hud-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Job</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Notify</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="pl-4">
                    <div className="text-sm font-medium">{j.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{j.id}</div>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {j.schedule}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase">
                      <StatusDot tone={j.enabled ? "online" : "idle"} pulse={j.enabled} />
                      {j.enabled ? "enabled" : "disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                    {j.notify?.length ? j.notify.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="pr-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={!j.enabled || runningId === j.id}
                        onClick={() => void runJob(j.id ?? "")}
                        title="Run now"
                      >
                        <Play className="size-3" />
                        {runningId === j.id ? "…" : "Run"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setEditing(j);
                          setFormOpen(true);
                        }}
                        title="Edit"
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setOpenId(openId === j.id ? null : j.id)}
                        title="View prompt"
                      >
                        <ChevronRight
                          className={`size-3 transition-transform ${openId === j.id ? "rotate-90" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={!j.id}
                        onClick={() => void removeJob(j)}
                        title="Delete"
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {open && (
          <div className="border-t border-border/70 bg-background/40 p-4">
            <div className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              {open.name} · {open.id}
            </div>
            <pre className="max-h-80 overflow-auto rounded-md border border-border/70 bg-background/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {open.task}
            </pre>
          </div>
        )}
      </Panel>

      <CronForm open={formOpen} onOpenChange={setFormOpen} job={editing} onSaved={load} />
    </>
  );
}
