"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/hud/field";

const APIS = [
  "anthropic",
  "openai-completions",
  "openai-responses",
  "google",
  "anthropic-messages",
];

interface ModelRow {
  id: string;
  name: string;
  contextWindow: string;
  maxTokens: string;
}

interface RawProvider {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: Array<{ id?: string; name?: string; contextWindow?: number; maxTokens?: number }>;
}

export function ModelForm({
  open,
  onOpenChange,
  providerKey,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null → add provider; a key → edit */
  providerKey: string | null;
  onSaved: () => void;
}) {
  const editing = !!providerKey;
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiType, setApiType] = useState("openai-completions");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<ModelRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    api
      .config()
      .then((cfg) => {
        const providers = (cfg.providers ?? {}) as Record<string, RawProvider>;
        const p = providerKey ? providers[providerKey] : undefined;
        setKey(providerKey ?? "");
        setBaseUrl(p?.baseUrl ?? "");
        setApiType(p?.api ?? "openai-completions");
        setApiKey(p?.apiKey ?? "");
        setModels(
          (p?.models ?? []).map((m) => ({
            id: m.id ?? "",
            name: m.name ?? "",
            contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
            maxTokens: m.maxTokens != null ? String(m.maxTokens) : "",
          })),
        );
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setBusy(false));
  }, [open, providerKey]);

  const setRow = (i: number, patch: Partial<ModelRow>) =>
    setModels((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!key.trim() || !baseUrl.trim() || models.length === 0 || models.some((m) => !m.id.trim())) {
      toast.error("Key, base URL and at least one model (with an id) are required.");
      return;
    }
    setBusy(true);
    try {
      const cfg = await api.config();
      const providers = { ...((cfg.providers ?? {}) as Record<string, RawProvider>) };
      providers[key.trim()] = {
        baseUrl: baseUrl.trim(),
        api: apiType,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        models: models.map((m) => ({
          id: m.id.trim(),
          name: m.name.trim() || m.id.trim(),
          ...(m.contextWindow ? { contextWindow: Number(m.contextWindow) } : {}),
          ...(m.maxTokens ? { maxTokens: Number(m.maxTokens) } : {}),
        })),
      };
      const res = await api.saveConfig({ ...cfg, providers });
      if (res.ok) {
        toast.success(`Saved provider "${key}". Restart the daemon to load it.`);
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(res.error ?? "Save failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? `Edit provider · ${providerKey}` : "Add model provider"}
        description="Writes ~/.vargos/agent/models.json. Restart the daemon to pick up changes."
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider key" htmlFor="mp-key" hint={editing ? "Immutable" : "e.g. anthropic, vargos-110:vllm-local"}>
              <Input
                id="mp-key"
                className="font-mono text-xs"
                value={key}
                disabled={editing}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <Field label="API type" htmlFor="mp-api">
              <select
                id="mp-api"
                value={apiType}
                onChange={(e) => setApiType(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {[...new Set([apiType, ...APIS])].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Base URL" htmlFor="mp-url">
            <Input
              id="mp-url"
              className="font-mono text-xs"
              placeholder="https://api.anthropic.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>

          <Field
            label="API key"
            htmlFor="mp-apikey"
            hint='Inline key (models.json). Use "local" for self-hosted endpoints; blank keeps auth.json.'
          >
            <Input
              id="mp-apikey"
              type="password"
              className="font-mono text-xs"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                Models
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setModels((r) => [...r, { id: "", name: "", contextWindow: "", maxTokens: "" }])
                }
              >
                <Plus className="size-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {models.map((m, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr_auto] gap-1.5">
                  <Input
                    className="font-mono text-xs"
                    placeholder="model id"
                    value={m.id}
                    onChange={(e) => setRow(i, { id: e.target.value })}
                  />
                  <Input
                    className="text-xs"
                    placeholder="display name"
                    value={m.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                  />
                  <Input
                    className="font-mono text-xs tabular-nums"
                    placeholder="ctx"
                    inputMode="numeric"
                    value={m.contextWindow}
                    onChange={(e) => setRow(i, { contextWindow: e.target.value.replace(/\D/g, "") })}
                  />
                  <Input
                    className="font-mono text-xs tabular-nums"
                    placeholder="max"
                    inputMode="numeric"
                    value={m.maxTokens}
                    onChange={(e) => setRow(i, { maxTokens: e.target.value.replace(/\D/g, "") })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setModels((r) => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </div>
              ))}
              {models.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No models — add at least one.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
