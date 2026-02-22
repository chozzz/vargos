/**
 * History sanitization and limiting for Vargos sessions
 * Sanitize and limit session history for context windows
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { SessionMessage } from '../sessions/types.js';

// ============================================================================
// Session → AgentMessage Conversion
// ============================================================================

/**
 * Convert FileSessionService messages to Pi SDK AgentMessage format.
 * Skips system messages (compaction notes, subagent announcements) — only user/assistant matter for LLM context.
 */
export function toAgentMessages(messages: SessionMessage[]): AgentMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
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
  if (root.startsWith('cron:')) return 10;
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
// Pipeline
// ============================================================================

/**
 * Full sanitization pipeline: repair tool pairing, then validate turns.
 */
export function sanitizeHistory(messages: AgentMessage[]): AgentMessage[] {
  const repaired = repairToolResultPairing(messages);
  return validateTurns(repaired);
}
