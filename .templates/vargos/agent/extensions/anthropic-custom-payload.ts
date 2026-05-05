// @ts-nocheck
/* eslint-disable */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: JsonValue, patch: JsonValue): JsonValue {
  if (!isObject(base) || !isObject(patch)) return patch;
  const merged: JsonObject = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key];
    if (isObject(baseValue) && isObject(patchValue)) {
      merged[key] = deepMerge(baseValue, patchValue);
    } else {
      merged[key] = patchValue;
    }
  }
  return merged;
}

function loadPatch(patchPath: string): JsonObject | undefined {
  if (!existsSync(patchPath)) return undefined;
  try {
    const raw = readFileSync(patchPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export default function anthropicCustomPayloadPatch(pi: ExtensionAPI) {
  const patchPath = join(process.env.HOME ?? "", ".vargos", "agent", "extensions", "anthropic-custom-payload.patch.json");

  pi.on("before_provider_request", (event, ctx) => {
    if (!isObject(event.payload)) return;
    const provider = event.payload["provider"];
    const modelInPayload = event.payload["model"];
    const modelProvider = ctx.model?.provider;

    // Prefer ctx.model (authoritative). Payload may omit provider.
    const isAnthropicRequest =
      modelProvider === "anthropic-custom" ||
      (typeof provider === "string" && provider === "anthropic-custom") ||
      (typeof modelInPayload === "string" && modelInPayload.toLowerCase().includes("claude"));
    if (!isAnthropicRequest) return;

    const patch = loadPatch(patchPath);
    if (!patch) return;

    const patchDeletes = Array.isArray(patch["$delete"])
      ? patch["$delete"].filter((k): k is string => typeof k === "string")
      : [];

    const { $delete: _delete, ...patchWithoutDelete } = patch;
    const merged = deepMerge(event.payload, patchWithoutDelete);
    if (!isObject(merged)) return merged;

    for (const key of patchDeletes) {
      delete merged[key];
    }

    return merged;
  });
}
