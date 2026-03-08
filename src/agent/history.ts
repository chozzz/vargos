/**
 * History sanitization and limiting for Vargos sessions
 * Sanitize and limit session history for context windows
 *
 * Pipeline: convert → sanitize → truncate tool results → token-budget prune → turn limit fallback
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { SessionMessage } from '../sessions/types.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('history');

// ============================================================================
// Session → AgentMessage Conversion
// ============================================================================

/**
 * Convert FileSessionService messages to Pi SDK AgentMessage format.
 * Keeps user, assistant, and subagent_announce system messages.
 * Subagent announcements are injected as user messages so the parent LLM can see results.
 */
export function toAgentMessages(messages: SessionMessage[]): AgentMessage[] {
  return messages
    .filter(m => {
      if (m.role === 'user' || m.role === 'assistant') return true;
      // Inject subagent announcements so parent can see results
      if (m.role === 'system' && m.metadata?.type === 'subagent_announce') return true;
      return false;
    })
    .map(m => {
      // Convert subagent_announce system messages to user messages for the LLM
      if (m.role === 'system' && m.metadata?.type === 'subagent_announce') {
        const ts = m.timestamp instanceof Date ? m.timestamp.getTime() : Number(m.timestamp);
        return { role: 'user', content: m.content, timestamp: ts } as AgentMessage;
      }
      const ts = m.timestamp instanceof Date ? m.timestamp.getTime() : Number(m.timestamp);
      if (m.role === 'user') {
        return { role: 'user', content: m.content, timestamp: ts } as AgentMessage;
      }
      return {
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'openai-completions',
        provider: 'unknown',
        model: 'unknown',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        stopReason: 'stop',
        timestamp: ts,
      } as unknown as AgentMessage;
    });
}

// ============================================================================
// History Limiting
// ============================================================================

/**
 * Limit history to the N most recent user turns.
 * Counts user messages backward and returns everything from the Nth-last user turn onward.
 */
export function limitHistoryTurns(
  messages: AgentMessage[],
  limit: number | undefined,
): AgentMessage[] {
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

/**
 * Get history turn limit based on session type.
 * Subagents inherit from root session type. Cron stays tight.
 */
export function getHistoryLimit(sessionKey: string): number {
  const root = sessionKey.split(':subagent:')[0];
  if (root.startsWith('cron:') || root.startsWith('webhook:')) return 10;
  if (root.startsWith('whatsapp:') || root.startsWith('telegram:')) return 30;
  return 50;
}

// ============================================================================
// History Sanitization
// ============================================================================

type MessageWithRole = AgentMessage & { role: string };

function hasRole(msg: AgentMessage): msg is MessageWithRole {
  return typeof (msg as { role?: unknown }).role === 'string';
}

/**
 * Merge consecutive same-role messages to prevent API rejections.
 * All major providers reject consecutive user or consecutive assistant messages.
 */
export function validateTurns(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= 1) return messages;

  const result: AgentMessage[] = [];

  for (const msg of messages) {
    if (!hasRole(msg)) {
      result.push(msg);
      continue;
    }

    const prev = result[result.length - 1];
    if (!prev || !hasRole(prev) || prev.role !== msg.role || msg.role === 'toolResult') {
      result.push(msg);
      continue;
    }

    // Merge consecutive same-role messages (except toolResult which is keyed by ID)
    const merged = mergeMessages(prev, msg);
    result[result.length - 1] = merged;
  }

  return result;
}

function mergeMessages(a: MessageWithRole, b: MessageWithRole): AgentMessage {
  const contentA = normalizeContent(a);
  const contentB = normalizeContent(b);
  return { ...a, content: [...contentA, ...contentB] } as AgentMessage;
}

function normalizeContent(
  msg: MessageWithRole,
): Array<{ type: string; text?: string; [key: string]: unknown }> {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [{ type: 'text', text: String(content) }];
}

/**
 * Fix tool result pairing issues that cause API rejections.
 * - For each assistant message with tool calls, ensure matching tool results follow
 * - Insert synthetic error results for missing tool call IDs
 * - Drop orphaned tool results with no matching call
 */
export function repairToolResultPairing(messages: AgentMessage[]): AgentMessage[] {
  const result: AgentMessage[] = [];
  const pendingCallIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as {
      role?: string;
      content?: unknown;
      toolCallId?: string;
      toolName?: string;
    };

    if (msg.role === 'assistant') {
      // Track tool call IDs from this assistant message
      const callIds = extractToolCallIds(msg.content);
      for (const id of callIds) pendingCallIds.add(id);
      result.push(messages[i]);
      continue;
    }

    if (msg.role === 'toolResult') {
      const id = msg.toolCallId;
      if (id && pendingCallIds.has(id)) {
        // Valid pairing
        pendingCallIds.delete(id);
        result.push(messages[i]);
      }
      // Drop orphaned tool results (no matching call)
      continue;
    }

    // Before pushing a non-toolResult message, synthesize missing results
    if (pendingCallIds.size > 0) {
      for (const id of pendingCallIds) {
        result.push(syntheticErrorResult(id));
      }
      pendingCallIds.clear();
    }

    result.push(messages[i]);
  }

  // Handle any remaining pending calls at the end
  if (pendingCallIds.size > 0) {
    for (const id of pendingCallIds) {
      result.push(syntheticErrorResult(id));
    }
  }

  return result;
}

function extractToolCallIds(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block: { type?: string; id?: string }) =>
      block?.type === 'tool_use' && typeof block?.id === 'string')
    .map((block: { id: string }) => block.id);
}

function syntheticErrorResult(toolCallId: string): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName: 'unknown',
    content: [{ type: 'text', text: '[result lost during session compaction]' }],
    isError: true,
    timestamp: Date.now(),
  } as unknown as AgentMessage;
}

// ============================================================================
// Tool Result Truncation (pre-injection)
// ============================================================================

const CHARS_PER_TOKEN = 4;
const MAX_TOOL_RESULT_SHARE = 0.3; // single tool result capped at 30% of context

/**
 * Truncate oversized tool results before injection.
 * Uses head+tail strategy to preserve errors/summaries at the end.
 */
export function truncateToolResults(
  messages: AgentMessage[],
  contextWindowTokens: number,
): AgentMessage[] {
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

    // Head + tail truncation
    const headChars = Math.floor(maxChars * 0.6);
    const tailChars = Math.floor(maxChars * 0.3);
    const fullText = textParts.map(b => b.text!).join('\n');
    const head = fullText.slice(0, headChars);
    const tail = fullText.slice(-tailChars);
    const note = `\n\n[Truncated: ${totalChars} chars → ${headChars + tailChars} chars]`;

    changed = true;
    return {
      ...msg,
      content: [{ type: 'text', text: `${head}\n...\n${tail}${note}` }],
    } as unknown as AgentMessage;
  });

  return changed ? result : messages;
}

// ============================================================================
// Token-Budget History Pruning
// ============================================================================

/** Rough token estimate for a message (4 chars ≈ 1 token). */
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

function estimateTotalTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

/** Default context budget: 50% of context window for history */
const DEFAULT_HISTORY_BUDGET_RATIO = 0.5;

export interface HistoryBudgetConfig {
  contextWindowTokens: number;
  /** Fraction of context window for history (default 0.5) */
  budgetRatio?: number;
}

/**
 * Prune history to fit within a token budget.
 * Drops oldest messages first, in chunks, until within budget.
 * Returns kept messages and count of dropped messages.
 */
export function pruneToTokenBudget(
  messages: AgentMessage[],
  config: HistoryBudgetConfig,
): { messages: AgentMessage[]; droppedCount: number } {
  const ratio = config.budgetRatio ?? DEFAULT_HISTORY_BUDGET_RATIO;
  const budget = Math.floor(config.contextWindowTokens * ratio);
  const totalTokens = estimateTotalTokens(messages);

  if (totalTokens <= budget) return { messages, droppedCount: 0 };

  // Drop from the front (oldest) until within budget
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

/**
 * Build a preamble message summarizing what was dropped.
 * Injected as the first user message so the agent knows context was lost.
 */
function buildDroppedPreamble(droppedCount: number): AgentMessage {
  return {
    role: 'user',
    content: `[System: ${droppedCount} older messages were pruned from history to fit context window. Earlier conversation context is no longer available.]`,
    timestamp: Date.now(),
  } as AgentMessage;
}

// ============================================================================
// Pipeline
// ============================================================================

/**
 * Full sanitization pipeline: repair tool pairing, then validate turns.
 */
export function sanitizeHistory(messages: AgentMessage[]): AgentMessage[] {
  const repaired = repairToolResultPairing(messages);
  return validateTurns(repaired);
}

/**
 * Full pre-injection pipeline:
 * 1. Truncate oversized tool results
 * 2. Token-budget prune (drop oldest)
 * 3. Turn-limit fallback (hard ceiling)
 * 4. Prepend preamble if messages were dropped
 */
export function prepareHistory(
  messages: AgentMessage[],
  sessionKey: string,
  contextWindowTokens?: number,
): AgentMessage[] {
  if (messages.length === 0) return messages;

  const contextWindow = contextWindowTokens ?? 128_000;

  // 1. Truncate oversized tool results
  let prepared = truncateToolResults(messages, contextWindow);

  // 2. Token-budget prune
  const { messages: budgeted, droppedCount } = pruneToTokenBudget(prepared, {
    contextWindowTokens: contextWindow,
  });
  prepared = budgeted;

  // 3. Turn-limit fallback (hard ceiling for safety)
  const turnLimit = getHistoryLimit(sessionKey);
  prepared = limitHistoryTurns(prepared, turnLimit);

  // 4. Prepend preamble if context was pruned
  if (droppedCount > 0) {
    log.info(`pruned ${droppedCount} messages to fit context budget (${contextWindow} tokens)`);
    prepared = [buildDroppedPreamble(droppedCount), ...prepared];
  }

  return prepared;
}
