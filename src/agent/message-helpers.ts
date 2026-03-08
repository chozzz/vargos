/**
 * Type-safe constructors for AgentMessage.
 * The Pi SDK AgentMessage type is opaque — these helpers centralize the cast
 * so production and test code don't need `as unknown as AgentMessage` everywhere.
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';

/** Cast a plain object to AgentMessage. Use the typed constructors below when possible. */
export function toMsg(obj: unknown): AgentMessage {
  return obj as AgentMessage;
}

export function userMessage(content: string, timestamp = Date.now()): AgentMessage {
  return toMsg({ role: 'user', content, timestamp });
}

export function assistantMessage(text: string, timestamp = Date.now()): AgentMessage {
  return toMsg({
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'unknown',
    model: 'unknown',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    stopReason: 'stop',
    timestamp,
  });
}

export function toolResultMessage(opts: {
  toolCallId: string;
  toolName?: string;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
  timestamp?: number;
}): AgentMessage {
  return toMsg({
    role: 'toolResult',
    toolCallId: opts.toolCallId,
    toolName: opts.toolName ?? 'unknown',
    content: opts.content,
    isError: opts.isError ?? false,
    timestamp: opts.timestamp ?? Date.now(),
  });
}
