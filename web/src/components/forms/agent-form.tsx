"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AgentPersona } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/hud/field";

type ToolMode = "all" | "restrict";

export function AgentForm({
  open,
  onOpenChange,
  persona,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null → new file; a persona → edit */
  persona: AgentPersona | null;
  onSaved: () => void;
}) {
  const editing = !!persona;
  const [file, setFile] = useState("");
  const [name, setName] = useState("");
  const [toolMode, setToolMode] = useState<ToolMode>("all");
  const [tools, setTools] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(persona?.file ?? "");
    setName(String(persona?.meta?.name ?? persona?.file?.replace(/\.md$/, "") ?? ""));
    const at = persona?.meta?.allowedTools;
    if (Array.isArray(at)) {
      setToolMode("restrict");
      setTools((at as string[]).join(", "));
    } else {
      setToolMode("all");
      setTools("");
    }
    setBody(persona?.body ?? "");
  }, [open, persona]);

  const submit = async () => {
    let fname = file.trim();
    if (!editing) {
      if (!fname) fname = `${name.trim() || "persona"}.md`;
      if (!fname.endsWith(".md")) fname += ".md";
    }
    if (!fname || !body.trim()) {
      toast.error("Filename and body are required.");
      return;
    }

    const meta: Record<string, unknown> = {};
    if (name.trim()) meta.name = name.trim();
    if (toolMode === "restrict") {
      meta.allowedTools = tools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    setBusy(true);
    const res = await fetch("/api/agents", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: fname, meta, body }),
    }).then((r) => r.json());
    setBusy(false);

    if (res.ok) {
      toast.success(`Saved ${fname}. Re-read on the next session for that channel.`);
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(res.error ?? "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? `Edit persona · ${persona?.file}` : "New persona"}
        description="Writes ~/.vargos/agents/<file>.md — frontmatter + body appended to the channel's system prompt."
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="File"
              htmlFor="ag-file"
              hint={editing ? "Immutable" : "Usually <channelId>.md or default.md"}
            >
              <Input
                id="ag-file"
                className="font-mono text-xs"
                placeholder="telegram-ops.md"
                value={file}
                disabled={editing}
                onChange={(e) => setFile(e.target.value)}
              />
            </Field>
            <Field label="Name" htmlFor="ag-name" hint="Shown to the agent as its identity.">
              <Input
                id="ag-name"
                placeholder="Ops Assistant"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Tools" hint="all = inherit every bus tool; restrict = glob whitelist only.">
            <div className="flex items-center gap-2">
              <select
                value={toolMode}
                onChange={(e) => setToolMode(e.target.value as ToolMode)}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="all">all tools</option>
                <option value="restrict">restrict to…</option>
              </select>
              {toolMode === "restrict" && (
                <Input
                  className="flex-1 font-mono text-xs"
                  placeholder="memory.*, web.*, cron.list"
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                />
              )}
            </div>
          </Field>

          <Field label="Persona body" htmlFor="ag-body" hint="Markdown. Appended after the bootstrap prompt.">
            <Textarea
              id="ag-body"
              rows={14}
              className="font-mono text-[12.5px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create persona"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
