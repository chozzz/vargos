"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { ModelProvider } from "@/lib/types";
import { useLiveRefresh } from "@/lib/use-vargos-socket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelForm } from "@/components/forms/model-form";
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

export default function ModelsPage() {
  const [providers, setProviders] = useState<ModelProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProviders((await api.models()).providers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  const openForm = (key: string | null) => {
    setEditingKey(key);
    setFormOpen(true);
  };

  const header = (
    <PageHeader
      eyebrow="Inference"
      title="Models"
      description={
        <>
          Providers and models from{" "}
          <code className="font-mono">~/.vargos/agent/models.json</code>. Restart the daemon
          to load edits.
        </>
      }
      actions={
        <Button size="sm" onClick={() => openForm(null)}>
          <Plus className="size-3.5" />
          Add provider
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <SectionError message={`Failed to load models: ${error}`} />
      </>
    );
  }
  if (!providers) {
    return (
      <>
        {header}
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        {providers.length === 0 && (
          <EmptyState icon={<Boxes />} message="No providers configured." />
        )}
        {providers.map((p) => (
          <Panel
            key={p.key}
            icon={<Boxes />}
            title={
              <span className="flex items-center gap-2">
                {p.key}
                {p.api && (
                  <Badge variant="outline" className="font-mono text-[10px] normal-case">
                    {p.api}
                  </Badge>
                )}
                {p.baseUrl && (
                  <span className="truncate normal-case text-muted-foreground/70">
                    {p.baseUrl}
                  </span>
                )}
              </span>
            }
            actions={
              <Button variant="ghost" size="xs" onClick={() => openForm(p.key)}>
                <Pencil className="size-3" />
                Edit
              </Button>
            }
            bodyClassName="p-0"
          >
            <Table className="hud-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Model</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead className="text-right">Context</TableHead>
                  <TableHead className="pr-4 text-right">Max tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.models.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4 font-mono text-sm">{m.id}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.input.length ? (
                          m.input.map((i) => (
                            <Badge key={i} variant="outline" className="font-mono text-[10px]">
                              {i}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {m.contextWindow ? m.contextWindow.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                      {m.maxTokens ? m.maxTokens.toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {p.models.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="pl-4 text-sm text-muted-foreground">
                      No models for this provider.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        ))}
      </div>

      <ModelForm
        open={formOpen}
        onOpenChange={setFormOpen}
        providerKey={editingKey}
        onSaved={load}
      />
    </>
  );
}
