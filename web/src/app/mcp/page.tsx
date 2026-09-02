"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { StatusDot } from "@/components/hud/status-dot";
import { api } from "@/lib/api";
import type { McpServer } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
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

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setServers((await api.mcp()).servers);
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
      eyebrow="Tools"
      title="MCP"
      description={
        <>
          Model Context Protocol servers (<code className="font-mono">config.mcpServers</code> +{" "}
          <code className="font-mono">agent/mcp.json</code>) with live connection status.
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to load MCP servers: ${error}`} />
      </>
    );
  }
  if (!servers) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-xl" />
      </>
    );
  }

  return (
    <>
      {header}
      <Panel title={`mcp servers · ${servers.length}`} icon={<Plug />} bodyClassName="p-0">
        {servers.length === 0 ? (
          <EmptyState icon={<Plug />} message="No MCP servers configured." />
        ) : (
          <Table className="hud-table">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Server</TableHead>
                <TableHead>Launch</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Tools</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="pl-4 font-mono text-sm">
                    {s.name}
                    {!s.enabled && (
                      <span className="ml-2 text-[10px] text-muted-foreground/70 uppercase">disabled</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <code className="font-mono text-[11px] break-all text-muted-foreground">
                      {s.command ? `${s.command} ${s.args.join(" ")}`.trim() : "—"}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s.transport}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase">
                      <StatusDot
                        tone={s.connected ? "online" : s.enabled ? "offline" : "idle"}
                        pulse={s.connected}
                      />
                      {s.connected ? "connected" : "offline"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                    {s.connected ? s.toolCount : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
