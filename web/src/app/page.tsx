"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Boxes,
  Bot,
  Cpu,
  Database,
  MessagesSquare,
  Radio,
  RotateCw,
  Server,
  Timer,
} from "lucide-react";
import { api, type StatusResponse } from "@/lib/api";
import type { ChannelSessions, CronTask, MemoryStats, ModelProvider } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
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
import { StatTile } from "@/components/hud/stat-tile";
import { LiveBadge } from "@/components/hud/status-dot";
import { SectionError, EmptyState } from "@/components/hud/states";

interface DashboardData {
  status: StatusResponse;
  cron: CronTask[];
  providers: ModelProvider[];
  sessions: ChannelSessions[];
  memory: MemoryStats;
}

function fmtStartedAt(v: unknown): string {
  if (typeof v === "number") {
    return new Date(v).toISOString().slice(0, 16).replace("T", " ");
  }
  return v ? String(v) : "—";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [status, cronRes, modelsRes, sessionsRes, memoryRes] = await Promise.all([
        api.status(),
        api.cron(),
        api.models(),
        api.sessions(),
        api.memory(),
      ]);
      setData({
        status,
        cron: cronRes.jobs,
        providers: modelsRes.providers,
        sessions: sessionsRes.channels,
        memory: memoryRes,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="System" title="Dashboard" />
        <SectionError message={`Failed to load vargos state: ${error}`} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader eyebrow="System" title="Dashboard" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const { status, cron, providers, sessions, memory } = data;
  const totalSessions = sessions.reduce((n, c) => n + c.fileCount, 0);
  const enabledCron = cron.filter((j) => j.enabled).length;
  const totalModels = providers.reduce((n, p) => n + p.models.length, 0);
  const memoryIndexed = memory.chunks > 0;
  const agentSessions =
    (status.agent?.sessions as Array<Record<string, unknown>> | undefined) ?? [];
  const runningRuns = agentSessions.filter((s) => s.state === "running").length;
  const online = status.gateway.online;

  const restartService = async (name: string) => {
    const res = await api.rpc("bus.restart", { service: name });
    if (res.ok) toast.success(`Service "${name}" restarted in-process.`);
    else toast.error(res.error ?? `Could not restart "${name}"`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Dashboard"
        description="Live state of the running Vargos agent OS — read straight from the data dir and the gateway, streamed over WebSocket."
        actions={<LiveBadge live={online} labelOn="Gateway online" labelOff="Gateway offline" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Gateway"
          icon={<Server />}
          value={<span className="font-mono text-lg">{`${status.gateway.host}:${status.gateway.port}`}</span>}
          hint={online ? "JSON-RPC reachable" : "daemon not running"}
          status={online ? "online" : "offline"}
        />
        <StatTile
          label="Sessions"
          icon={<MessagesSquare />}
          value={totalSessions.toLocaleString()}
          hint={`${sessions.length} channel dirs · on disk`}
        />
        <StatTile
          label="Cron jobs"
          icon={<Timer />}
          value={cron.length}
          hint={`${enabledCron} enabled`}
        />
        <StatTile
          label="Models"
          icon={<Boxes />}
          value={totalModels}
          hint={`${providers.length} providers`}
        />
        <StatTile
          label="Memory"
          icon={<Database />}
          value={memory.chunks.toLocaleString()}
          hint={memoryIndexed ? `${memory.files} files indexed` : "index empty"}
          status={memoryIndexed ? "online" : "offline"}
        />
        <StatTile
          label="Services"
          icon={<Cpu />}
          value={status.services?.length ?? "—"}
          hint={online ? "bus.status (live)" : "gateway offline"}
          status={online ? "online" : "idle"}
        />
        <StatTile
          label="Agent runs"
          icon={<Activity />}
          value={runningRuns}
          hint={`${agentSessions.length} sessions tracked`}
          status={online ? (runningRuns > 0 ? "online" : "idle") : "idle"}
        />
        <StatTile
          label="Channels"
          icon={<Radio />}
          value={online ? "streaming" : "n/a"}
          hint={`${status.configuredChannels.length} configured`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="services · bus.status" icon={<Cpu />}>
          {status.services && status.services.length > 0 ? (
            <Table className="hud-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.services.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-mono text-sm">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void restartService(s.name)}
                      >
                        <RotateCw className="size-3" />
                        Restart
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Cpu />}
              message={
                <>
                  Gateway offline — start the daemon (<code className="font-mono">vargos start</code>)
                  to see live service state.
                </>
              }
            />
          )}
        </Panel>

        <Panel title="agent sessions · agent.status" icon={<Bot />}>
          {agentSessions.length === 0 ? (
            <EmptyState icon={<Bot />} message="No agent sessions tracked in daemon memory." />
          ) : (
            <Table className="hud-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentSessions.map((s) => (
                  <TableRow key={String(s.sessionKey)}>
                    <TableCell className="font-mono text-xs">{String(s.sessionKey)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.state === "running" ? "default" : "outline"}
                        className="font-mono text-[11px]"
                      >
                        {String(s.state)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.model ? String(s.model) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {fmtStartedAt(s.startedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}
