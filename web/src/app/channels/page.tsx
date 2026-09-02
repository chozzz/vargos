"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Pencil, Plus, QrCode, Radio, RotateCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ChannelsPayload, ChannelConfig, ChannelStatus } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
import { ChannelForm } from "@/components/forms/channel-form";
import { WhatsAppPairDialog } from "@/components/forms/whatsapp-pair";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/hud/page-header";
import { Panel } from "@/components/hud/panel";
import { StatusDot } from "@/components/hud/status-dot";
import { SectionError, EmptyState } from "@/components/hud/states";

export default function ChannelsPage() {
  const [data, setData] = useState<ChannelsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelConfig | null>(null);
  const [pairId, setPairId] = useState<string | null>(null);

  const restartChannel = async (id: string) => {
    setRestartingId(id);
    const res = await api.rpc("channel.restart", { id });
    setRestartingId(null);
    if (res.ok) toast.success(`Channel "${id}" restarted.`);
    else toast.error(res.error ?? `Could not restart "${id}"`);
  };

  const removeChannel = async (id: string) => {
    if (!confirm(`Delete channel "${id}"? This stops the adapter and removes it from config.`)) {
      return;
    }
    const res = await api.rpc("channel.unregister", { id });
    if (res.ok) {
      toast.success(`Deleted channel "${id}".`);
      void load();
    } else {
      toast.error(res.error ?? `Could not delete "${id}"`);
    }
  };

  const load = useCallback(async () => {
    try {
      setData(await api.channels());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const header = (last?: React.ReactNode) => (
    <PageHeader
      eyebrow="Presence"
      title="Channels"
      description={
        <>
          Configured in <code className="font-mono">~/.vargos/config.json</code>; live status
          from <code className="font-mono">channel.list</code>.
        </>
      }
      actions={last}
    />
  );

  if (error) {
    return (
      <>
        {header()}
        <SectionError message={`Failed to load channels: ${error}`} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header()}
        <Skeleton className="h-64 rounded-xl" />
      </>
    );
  }

  const statusById = new Map<string, ChannelStatus>();
  for (const s of data.live ?? []) statusById.set(s.id, s);

  return (
    <>
      {header(
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          Register
        </Button>,
      )}
      <Panel title="channels" icon={<Radio />} bodyClassName="p-0">
        {data.configured.length === 0 ? (
          <EmptyState icon={<Radio />} message="No channels configured." />
        ) : (
          <Table className="hud-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ID</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Live</TableHead>
                <TableHead>Config</TableHead>
                <TableHead className="pr-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.configured.map((c: ChannelConfig) => {
                const live = statusById.get(c.id);
                const connected = live?.status === "connected";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 font-mono text-sm">
                      {String(c.type ?? "—")}
                      <span className="text-muted-foreground/60"> / </span>
                      {c.id}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.enabled ? "outline" : "secondary"}
                        className="font-mono text-[10px]"
                      >
                        {c.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {live ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase">
                          <StatusDot tone={connected ? "online" : "offline"} pulse={connected} />
                          {connected ? "connected" : "disconnected"}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-muted-foreground/60">n/a</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <details className="group text-xs">
                        <summary className="flex cursor-pointer items-center gap-1.5 font-mono text-muted-foreground select-none">
                          <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                          {Object.keys(c).length} keys
                        </summary>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border/70 bg-background/60 p-2 font-mono text-[11px] whitespace-pre-wrap">
                          {JSON.stringify(c, null, 2)}
                        </pre>
                      </details>
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {String(c.type) === "whatsapp" && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setPairId(c.id)}
                            title="Pair via QR"
                          >
                            <QrCode className="size-3" />
                            {connected ? "Re-pair" : "Pair"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                          title="Edit"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={restartingId === c.id}
                          onClick={() => void restartChannel(c.id)}
                          title="Restart adapter"
                        >
                          <RotateCw
                            className={restartingId === c.id ? "size-3 animate-spin" : "size-3"}
                          />
                          {restartingId === c.id ? "…" : "Restart"}
                        </Button>
                        {!connected && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => void removeChannel(c.id)}
                            title="Delete channel"
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <ChannelForm
        open={formOpen}
        onOpenChange={setFormOpen}
        channel={editing}
        onSaved={load}
      />

      {pairId && (
        <WhatsAppPairDialog
          open={!!pairId}
          onOpenChange={(v) => !v && setPairId(null)}
          channelId={pairId}
          onPaired={load}
        />
      )}
    </>
  );
}
