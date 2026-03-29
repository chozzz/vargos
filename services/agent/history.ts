/**
 * History sanitization and limiting for Vargos sessions
 *
 * Pipeline: convert → sanitize → truncate tool results → token-budget prune → turn limit fallback
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Message } from '../../gateway/events.js';
import { createLogger } from '../../lib/logger.js';
import { CHARS_PER_TOKEN, toMsg, userMessage, assistantMessage, toolResultMessage } from './message-helpers.js';

const log = createLogger('history');

// ── Session → AgentMessage Conversion ─────────────────────────────────────────

/** System message types injected as user messages so the LLM can see them in history */
const INJECTABLE_SYSTEM_TYPES = new Set(['subagent_announce', 'media_transform']);

export function toAgentMessages(messages: Message[]): AgentMessage[] {
  return messages
    .filter(m => {
      if (m.role === 'user' || m.role === 'assistant') return true;
      if (m.role === 'system' && INJECTABLE_SYSTEM_TYPES.has(m.metadata?.type as string)) return true;
      return false;
    })
    .map(m => {
      const ts = m.timestamp instanceof Date ? m.timestamp.getTime() : Number(m.timestamp);
      if (m.role === 'user' || (m.role === 'system' && INJECTABLE_SYSTEM_TYPES.has(m.metadata?.type as string))) {
        return userMessage(m.content, ts);
      }
      return assistantMessage(m.content, ts);
    });
}

// ── History Limiting ───────────────────────────────────────────────────────────

export function limitHistoryTurns(messages: AgentMessage[], limit: number | undefined): AgentMessage[] {
  if (!limit || limit <= 0 || messages.length === 0) return messages;

  let userCount = 0;
  let cutIndex = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string };
    if (msg.role === 'user') {
      userCount++;
      if (userCount > limit) return messages.slice(cutIndex);
      cutIndex = i;
    }
  }

  return messages;
}

export function getHistoryLimit(sessionKey: string): number {
  const root = sessionKey.split(':subagent:')[0];
  if (root.startsWith('cron:') || root.startsWith('webhook:')) return 10;
  if (root.startsWith('whatsapp:') || root.startsWith('telegram:')) return 30;
  return 50;
}

// ── History Sanitization ──────────────────────────────────────────────────────

type MessageWithRole = AgentMessage & { role: string };

function hasRole(msg: AgentMessage): msg is MessageWithRole {
  return typeof (msg as { role?: unknown }).role === 'string';
}

export function validateTurns(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= 1) return messages;

  const result: AgentMessage[] = [];

  for (const msg of messages) {
    if (!hasRole(msg)) { result.push(msg); continue; }

    const prev = result[result.length - 1];
    if (!prev || !hasRole(prev) || prev.role !== msg.role || msg.role === 'toolResult') {
      result.push(msg);
      continue;
    }

    result[result.length - 1] = mergeMessages(prev, msg);
  }

  return result;
}

function mergeMessages(a: MessageWithRole, b: MessageWithRole): AgentMessage {
  return { ...a, content: [...normalizeContent(a), ...normalizeContent(b)] } as AgentMessage;
}

function normalizeContent(
  msg: MessageWithRole,
): Array<{ type: string; text?: string; [key: string]: unknown }> {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content;
  return [{ type: 'text', text: String(content) }];
}

export function repairToolResultPairing(messages: AgentMessage[]): AgentMessage[] {
  const result: AgentMessage[] = [];
  const pendingCallIds = new Set<string>();

  for (const msg of messages) {
    const m = msg as { role?: string; content?: unknown; toolCallId?: string };

    if (m.role === 'assistant') {
      const callIds = extractToolCallIds(m.content);
      for (const id of callIds) pendingCallIds.add(id);
      result.push(msg);
      continue;
    }

    if (m.role === 'toolResult') {
      const id = m.toolCallId;
      if (id && pendingCallIds.has(id)) {
        pendingCallIds.delete(id);
        result.push(msg);
      }
      continue;
    }

    if (pendingCallIds.size > 0) {
      for (const id of pendingCallIds) result.push(syntheticErrorResult(id));
      pendingCallIds.clear();
    }

    result.push(msg);
  }

  if (pendingCallIds.size > 0) {
    for (const id of pendingCallIds) result.push(syntheticErrorResult(id));
  }

  return result;
}

function extractToolCallIds(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block: { type?: string; id?: string }) => block?.type === 'tool_use' && typeof block?.id === 'string')
    .map((block: { id: string }) => block.id);
}

function syntheticErrorResult(toolCallId: string): AgentMessage {
  return toolResultMessage({
    toolCallId,
    content: [{ type: 'text', text: '[result lost during session compaction]' }],
    isError: true,
  });
}

// ── Tool Result Truncation ─────────────────────────────────────────────────────

const MAX_TOOL_RESULT_SHARE = 0.3;

export function truncateToolResults(messages: AgentMessage[], contextWindowTokens: number): AgentMessage[] {
  if (contextWindowTokens <= 0) return messages;

  const maxChars = Math.floor(contextWindowTokens * CHARS_PER_TOKEN * MAX_TOOL_RESULT_SHARE);
  let changed = false;
  const result = messages.map(msg => {
    const m = msg as { role?: string; content?: unknown };
    if (m.role !== 'toolResult' || !Array.isArray(m.content)) return msg;

    const textParts = (m.content as Array<{ type?: string; text?: string }>)
      .filter(b => b.type === 'text' && typeof b.text === 'string');
    const totalChars = textParts.reduce((sum, b) => sum + (b.text?.length ?? 0), 0);
    if (totalChars <= maxChars) return msg;

    const headChars = Math.floor(maxChars * 0.6);
    const tailChars = Math.floor(maxChars * 0.3);
    const fullText = textParts.map(b => b.text!).join('\n');
    const note = `\n\n[Truncated: ${totalChars} chars → ${headChars + tailChars} chars]`;

    changed = true;
    return toMsg({
      ...msg,
      content: [{ type: 'text', text: `${fullText.slice(0, headChars)}\n...\n${fullText.slice(-tailChars)}${note}` }],
    });
  });

  return changed ? result : messages;
}

// ── Token-Budget History Pruning ───────────────────────────────────────────────

export function estimateMessageTokens(msg: AgentMessage): number {
  const m = msg as { role?: string; content?: unknown };
  if (typeof m.content === 'string') return Math.ceil(m.content.length / CHARS_PER_TOKEN);
  if (Array.isArray(m.content)) {
    let chars = 0;
    for (const b of m.content as Array<{ type?: string; text?: string; thinking?: string }>) {
      if (b.type === 'text') chars += (b.text ?? '').length;
      else if (b.type === 'thinking') chars += (b.thinking ?? '').length;
      else if (b.type === 'tool_use') {
        try { chars += JSON.stringify(b).length; } catch { chars += 128; }
      }
      else chars += 256;
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }
  return 64;
}

export interface HistoryBudgetConfig {
  contextWindowTokens: number;
  budgetRatio?: number;
}

export function pruneToTokenBudget(
  messages: AgentMessage[],
  config: HistoryBudgetConfig,
): { messages: AgentMessage[]; droppedCount: number } {
  const ratio = config.budgetRatio ?? 0.5;
  const budget = Math.floor(config.contextWindowTokens * ratio);
  const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);

  if (totalTokens <= budget) return { messages, droppedCount: 0 };

  let droppedCount = 0;
  let currentTokens = totalTokens;
  let startIndex = 0;

  while (startIndex < messages.length && currentTokens > budget) {
    currentTokens -= estimateMessageTokens(messages[startIndex]);
    startIndex++;
    droppedCount++;
  }

  return { messages: messages.slice(startIndex), droppedCount };
}

// ── Pipeline ───────────────────────────────────────────────────────────────────

export function sanitizeHistory(messages: AgentMessage[]): AgentMessage[] {
  return validateTurns(repairToolResultPairing(messages));
}

export function prepareHistory(
  messages: AgentMessage[],
  sessionKey: string,
  contextWindowTokens?: number,
): AgentMessage[] {
  if (messages.length === 0) return messages;

  const contextWindow = contextWindowTokens ?? 128_000;
  let prepared = truncateToolResults(messages, contextWindow);

  const { messages: budgeted, droppedCount } = pruneToTokenBudget(prepared, { contextWindowTokens: contextWindow });
  prepared = budgeted;

  prepared = limitHistoryTurns(prepared, getHistoryLimit(sessionKey));

  if (droppedCount > 0) {
    log.info(`pruned ${droppedCount} messages to fit context budget (${contextWindow} tokens)`);
    const preamble = userMessage(
      `[System: ${droppedCount} older messages were pruned from history to fit context window. Earlier conversation context is no longer available.]`,
    );
    prepared = [preamble, ...prepared];
  }

  return prepared;
}
