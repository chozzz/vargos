/**
 * Context pruning — trims old tool results before sending to LLM.
 *
 * Two tiers:
 *   1. Soft trim — keep head + tail of large tool results
 *   2. Hard clear — replace remaining old tool results with placeholder
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { CHARS_PER_TOKEN, toMsg } from '../message-helpers.js';

const IMAGE_CHAR_ESTIMATE = 8_000;

// ── Config ─────────────────────────────────────────────────────────────────────

export interface ContextPruningConfig {
  enabled?: boolean;
  keepLastAssistants?: number;
  softTrimRatio?: number;
  hardClearRatio?: number;
  softTrim?: { maxChars?: number; headChars?: number; tailChars?: number };
  tools?: { allow?: string[]; deny?: string[] };
}

interface ContextPruningSettings {
  keepLastAssistants: number;
  softTrimRatio: number;
  hardClearRatio: number;
  softTrim: { maxChars: number; headChars: number; tailChars: number };
  tools: { allow?: string[]; deny?: string[] };
}

const DEFAULTS: ContextPruningSettings = {
  keepLastAssistants: 3,
  softTrimRatio: 0.3,
  hardClearRatio: 0.5,
  softTrim: { maxChars: 4_000, headChars: 1_500, tailChars: 1_500 },
  tools: {},
};

const HARD_CLEAR_PLACEHOLDER = '[Tool result cleared — context pruning]';

// ── Helpers ────────────────────────────────────────────────────────────────────

type TextBlock  = { type: 'text'; text: string };
type ImageBlock = { type: 'image'; [k: string]: unknown };
type ContentBlock = TextBlock | ImageBlock | { type: string; [k: string]: unknown };

function asText(text: string): TextBlock { return { type: 'text', text }; }

function hasImageBlocks(content: ContentBlock[]): boolean {
  return content.some(b => b.type === 'image');
}

function collectTextParts(content: ContentBlock[]): string[] {
  return content.filter(b => b.type === 'text').map(b => (b as TextBlock).text);
}

function joinedTextLength(parts: string[]): number {
  return parts.reduce((sum, p) => sum + p.length, 0) + Math.max(0, parts.length - 1);
}

function takeHead(parts: string[], max: number): string {
  if (max <= 0 || parts.length === 0) return '';
  let remaining = max;
  let out = '';
  for (let i = 0; i < parts.length && remaining > 0; i++) {
    if (i > 0) { out += '\n'; remaining--; if (remaining <= 0) break; }
    const p = parts[i];
    if (p.length <= remaining) { out += p; remaining -= p.length; }
    else { out += p.slice(0, remaining); remaining = 0; }
  }
  return out;
}

function takeTail(parts: string[], max: number): string {
  if (max <= 0 || parts.length === 0) return '';
  let remaining = max;
  const out: string[] = [];
  for (let i = parts.length - 1; i >= 0 && remaining > 0; i--) {
    const p = parts[i];
    if (p.length <= remaining) { out.push(p); remaining -= p.length; }
    else { out.push(p.slice(p.length - remaining)); remaining = 0; break; }
    if (remaining > 0 && i > 0) { out.push('\n'); remaining--; }
  }
  out.reverse();
  return out.join('');
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function estimateMessageChars(msg: AgentMessage): number {
  const m = msg as { role?: string; content?: unknown };

  if (m.role === 'user') {
    if (typeof m.content === 'string') return m.content.length;
    if (Array.isArray(m.content)) {
      return (m.content as Array<{ type: string; text?: string }>).reduce((sum, b) => {
        if (b.type === 'text') return sum + (b.text ?? '').length;
        if (b.type === 'image') return sum + IMAGE_CHAR_ESTIMATE;
        return sum;
      }, 0);
    }
    return 256;
  }

  if (m.role === 'assistant') {
    if (!Array.isArray(m.content)) return 256;
    return (m.content as Array<{ type: string; text?: string; thinking?: string }>).reduce((sum, b) => {
      if (b.type === 'text') return sum + (b.text ?? '').length;
      if (b.type === 'thinking') return sum + (b.thinking ?? '').length;
      if (b.type === 'toolCall') {
        try { return sum + JSON.stringify((b as { arguments?: unknown }).arguments ?? {}).length; }
        catch { return sum + 128; }
      }
      return sum;
    }, 0);
  }

  if (m.role === 'toolResult') {
    if (!Array.isArray(m.content)) return 256;
    return (m.content as Array<{ type: string; text?: string }>).reduce((sum, b) => {
      if (b.type === 'text') return sum + (b.text ?? '').length;
      if (b.type === 'image') return sum + IMAGE_CHAR_ESTIMATE;
      return sum;
    }, 0);
  }

  return 256;
}

export function resolveSettings(cfg?: ContextPruningConfig): ContextPruningSettings {
  const s = { ...DEFAULTS, softTrim: { ...DEFAULTS.softTrim }, tools: { ...DEFAULTS.tools } };
  if (!cfg) return s;

  if (typeof cfg.keepLastAssistants === 'number') s.keepLastAssistants = Math.max(0, Math.floor(cfg.keepLastAssistants));
  if (typeof cfg.softTrimRatio === 'number') s.softTrimRatio = Math.min(1, Math.max(0, cfg.softTrimRatio));
  if (typeof cfg.hardClearRatio === 'number') s.hardClearRatio = Math.min(1, Math.max(0, cfg.hardClearRatio));
  if (cfg.tools) s.tools = cfg.tools;
  if (cfg.softTrim) {
    if (typeof cfg.softTrim.maxChars === 'number') s.softTrim.maxChars = Math.max(0, cfg.softTrim.maxChars);
    if (typeof cfg.softTrim.headChars === 'number') s.softTrim.headChars = Math.max(0, cfg.softTrim.headChars);
    if (typeof cfg.softTrim.tailChars === 'number') s.softTrim.tailChars = Math.max(0, cfg.softTrim.tailChars);
  }
  return s;
}

function isToolPrunable(toolName: string, tools: ContextPruningSettings['tools']): boolean {
  if (tools.allow && tools.allow.length > 0) return tools.allow.includes(toolName);
  if (tools.deny && tools.deny.length > 0) return !tools.deny.includes(toolName);
  return true;
}

function findAssistantCutoff(messages: AgentMessage[], keep: number): number | null {
  if (keep <= 0) return messages.length;
  let remaining = keep;
  for (let i = messages.length - 1; i >= 0; i--) {
    if ((messages[i] as { role?: string }).role === 'assistant') {
      remaining--;
      if (remaining === 0) return i;
    }
  }
  return null;
}

function findFirstUserIndex(messages: AgentMessage[]): number {
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as { role?: string }).role === 'user') return i;
  }
  return messages.length;
}

type ToolResultMsg = AgentMessage & {
  role: 'toolResult';
  toolName: string;
  content: ContentBlock[];
};

function softTrimToolResult(msg: ToolResultMsg, settings: ContextPruningSettings): ToolResultMsg | null {
  if (hasImageBlocks(msg.content)) return null;
  const parts = collectTextParts(msg.content);
  const rawLen = joinedTextLength(parts);
  if (rawLen <= settings.softTrim.maxChars) return null;
  const { headChars, tailChars } = settings.softTrim;
  if (headChars + tailChars >= rawLen) return null;
  const trimmed = `${takeHead(parts, headChars)}\n...\n${takeTail(parts, tailChars)}`;
  const note = `\n\n[Tool result trimmed: kept first ${headChars} chars and last ${tailChars} chars of ${rawLen} chars.]`;
  return { ...msg, content: [asText(trimmed + note)] };
}

export function pruneContextMessages(
  messages: AgentMessage[],
  settings: ContextPruningSettings,
  contextWindowTokens: number,
): AgentMessage[] {
  if (!contextWindowTokens || contextWindowTokens <= 0) return messages;

  const charWindow = contextWindowTokens * CHARS_PER_TOKEN;
  const cutoff = findAssistantCutoff(messages, settings.keepLastAssistants);
  if (cutoff === null) return messages;

  const pruneStart = findFirstUserIndex(messages);
  let totalChars = messages.reduce((sum, m) => sum + estimateMessageChars(m), 0);
  let ratio = totalChars / charWindow;
  if (ratio < settings.softTrimRatio) return messages;

  const prunableIndexes: number[] = [];
  let next: AgentMessage[] | null = null;

  // Phase 1: soft trim
  for (let i = pruneStart; i < cutoff; i++) {
    const msg = messages[i] as { role?: string; toolName?: string; content?: unknown };
    if (msg.role !== 'toolResult') continue;
    if (!isToolPrunable(msg.toolName ?? '', settings.tools)) continue;
    if (hasImageBlocks(msg.content as ContentBlock[] ?? [])) continue;
    prunableIndexes.push(i);

    const updated = softTrimToolResult(messages[i] as ToolResultMsg, settings);
    if (!updated) continue;

    const before = estimateMessageChars(messages[i]);
    const after = estimateMessageChars(toMsg(updated));
    totalChars += after - before;
    if (!next) next = messages.slice();
    next[i] = toMsg(updated);
  }

  const afterSoftTrim = next ?? messages;
  ratio = totalChars / charWindow;
  if (ratio < settings.hardClearRatio) return afterSoftTrim;

  // Phase 2: hard clear
  for (const i of prunableIndexes) {
    if (ratio < settings.hardClearRatio) break;
    const msg = afterSoftTrim[i] as { role?: string };
    if (msg.role !== 'toolResult') continue;
    const before = estimateMessageChars(afterSoftTrim[i]);
    const cleared = { ...afterSoftTrim[i], content: [asText(HARD_CLEAR_PLACEHOLDER)] };
    if (!next) next = messages.slice();
    next[i] = cleared as AgentMessage;
    totalChars += estimateMessageChars(cleared as AgentMessage) - before;
    ratio = totalChars / charWindow;
  }

  return next ?? messages;
}

export function stripImageBlocks(messages: AgentMessage[]): AgentMessage[] {
  let changed = false;
  const result: AgentMessage[] = [];

  for (const msg of messages) {
    const m = msg as { role?: string; content?: unknown };
    if (!Array.isArray(m.content)) { result.push(msg); continue; }

    const hasImage = (m.content as ContentBlock[]).some(b => b.type === 'image');
    if (!hasImage) { result.push(msg); continue; }

    changed = true;
    const filtered = (m.content as ContentBlock[]).filter(b => b.type !== 'image');
    if (filtered.length === 0) {
      filtered.push(asText('[Image content removed — model does not support vision]'));
    }
    result.push({ ...msg, content: filtered } as AgentMessage);
  }

  return changed ? result : messages;
}

export function createContextPruningExtension(cfg?: ContextPruningConfig): (api: ExtensionAPI) => void {
  const settings = resolveSettings(cfg);

  return (api: ExtensionAPI) => {
    api.on('context', (event, ctx) => {
      let messages = stripImageBlocks(event.messages);

      const contextWindow = ctx.model?.contextWindow;
      if (contextWindow && contextWindow > 0) {
        messages = pruneContextMessages(messages, settings, contextWindow);
      }

      if (messages !== event.messages) return { messages };
    });
  };
}
