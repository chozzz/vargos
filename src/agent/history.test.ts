import { describe, it, expect } from 'vitest';
import {
  limitHistoryTurns,
  getHistoryLimit,
  validateTurns,
  repairToolResultPairing,
  sanitizeHistory,
  toAgentMessages,
  truncateToolResults,
  pruneToTokenBudget,
  prepareHistory,
  estimateMessageTokens,
} from './history.js';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { SessionMessage } from '../sessions/types.js';
import { toMsg as msg, userMessage as userMsg } from './message-helpers.js';

function assistantMsg(text: string) {
  return msg({ role: 'assistant', content: [{ type: 'text', text }], timestamp: Date.now() });
}

function assistantWithTools(toolCalls: Array<{ id: string; name: string }>) {
  return msg({
    role: 'assistant',
    content: toolCalls.map((tc) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: {} })),
    timestamp: Date.now(),
  });
}

function toolResult(toolCallId: string, toolName: string, text = 'ok') {
  return msg({
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text }],
    isError: false,
    timestamp: Date.now(),
  });
}

// ============================================================================
// limitHistoryTurns
// ============================================================================

describe('limitHistoryTurns', () => {
  it('returns empty array unchanged', () => {
    expect(limitHistoryTurns([], 10)).toEqual([]);
  });

  it('returns all messages when under limit', () => {
    const msgs = [userMsg('a'), assistantMsg('b'), userMsg('c'), assistantMsg('d')];
    expect(limitHistoryTurns(msgs, 10)).toEqual(msgs);
  });

  it('returns all messages when limit is undefined', () => {
    const msgs = [userMsg('a'), assistantMsg('b')];
    expect(limitHistoryTurns(msgs, undefined)).toEqual(msgs);
  });

  it('trims to most recent N user turns', () => {
    const msgs = [
      userMsg('1'), assistantMsg('r1'),
      userMsg('2'), assistantMsg('r2'),
      userMsg('3'), assistantMsg('r3'),
    ];
    const result = limitHistoryTurns(msgs, 2);
    // Should keep last 2 user turns: '2' and '3' with their responses
    expect(result.length).toBe(4);
    expect((result[0] as unknown as { content: string }).content).toBe('2');
  });

  it('handles exact limit', () => {
    const msgs = [
      userMsg('1'), assistantMsg('r1'),
      userMsg('2'), assistantMsg('r2'),
    ];
    const result = limitHistoryTurns(msgs, 2);
    expect(result).toEqual(msgs);
  });

  it('keeps tool results between user turns', () => {
    const msgs = [
      userMsg('old'),
      assistantWithTools([{ id: 't1', name: 'read' }]),
      toolResult('t1', 'read'),
      assistantMsg('old-response'),
      userMsg('recent'),
      assistantMsg('recent-response'),
    ];
    const result = limitHistoryTurns(msgs, 1);
    expect(result.length).toBe(2);
    expect((result[0] as unknown as { content: string }).content).toBe('recent');
  });
});

// ============================================================================
// getHistoryLimit
// ============================================================================

describe('getHistoryLimit', () => {
  it('returns 30 for WhatsApp sessions', () => {
    expect(getHistoryLimit('whatsapp:user123')).toBe(30);
  });

  it('returns 30 for Telegram sessions', () => {
    expect(getHistoryLimit('telegram:chat456')).toBe(30);
  });

  it('returns 50 for CLI sessions', () => {
    expect(getHistoryLimit('cli:main')).toBe(50);
  });

  it('returns 50 for subagent sessions (inherits from root)', () => {
    expect(getHistoryLimit('cli:main:subagent:abc')).toBe(50);
  });

  it('returns 30 for channel subagent sessions (inherits from root)', () => {
    expect(getHistoryLimit('whatsapp:user123:subagent:abc')).toBe(30);
  });

  it('returns 10 for cron sessions', () => {
    expect(getHistoryLimit('cron:heartbeat')).toBe(10);
  });

  it('returns 10 for cron subagent sessions', () => {
    expect(getHistoryLimit('cron:heartbeat:subagent:abc')).toBe(10);
  });

  it('returns 50 for unknown session types', () => {
    expect(getHistoryLimit('other:thing')).toBe(50);
  });
});

// ============================================================================
// validateTurns
// ============================================================================

describe('validateTurns', () => {
  it('returns empty array unchanged', () => {
    expect(validateTurns([])).toEqual([]);
  });

  it('leaves alternating turns unchanged', () => {
    const msgs = [userMsg('a'), assistantMsg('b'), userMsg('c')];
    expect(validateTurns(msgs)).toEqual(msgs);
  });

  it('merges consecutive user messages', () => {
    const msgs = [userMsg('hello'), userMsg('world')];
    const result = validateTurns(msgs);
    expect(result.length).toBe(1);
    const content = (result[0] as unknown as { content: unknown }).content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as Array<{ text: string }>).map((c) => c.text)).toEqual(['hello', 'world']);
  });

  it('merges consecutive assistant messages', () => {
    const msgs = [userMsg('q'), assistantMsg('a1'), assistantMsg('a2')];
    const result = validateTurns(msgs);
    expect(result.length).toBe(2);
  });

  it('does NOT merge consecutive toolResult messages', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }, { id: 't2', name: 'write' }]),
      toolResult('t1', 'read'),
      toolResult('t2', 'write'),
      assistantMsg('done'),
    ];
    const result = validateTurns(msgs);
    const toolResults = result.filter((m) => (m as unknown as { role: string }).role === 'toolResult');
    expect(toolResults.length).toBe(2);
  });
});

// ============================================================================
// repairToolResultPairing
// ============================================================================

describe('repairToolResultPairing', () => {
  it('leaves well-formed conversations unchanged', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }]),
      toolResult('t1', 'read'),
      assistantMsg('done'),
    ];
    const result = repairToolResultPairing(msgs);
    expect(result.length).toBe(4);
  });

  it('inserts synthetic error for missing tool results', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }, { id: 't2', name: 'write' }]),
      toolResult('t1', 'read'),
      userMsg('next'),
    ];
    const result = repairToolResultPairing(msgs);
    const synth = result.find(
      (m) => (m as unknown as { toolCallId?: string }).toolCallId === 't2',
    ) as unknown as { isError?: boolean } | undefined;
    expect(synth).toBeDefined();
    expect(synth!.isError).toBe(true);
  });

  it('drops orphaned tool results', () => {
    const msgs = [
      userMsg('q'),
      toolResult('orphan', 'read'),
      assistantMsg('done'),
    ];
    const result = repairToolResultPairing(msgs);
    expect(result.length).toBe(2);
  });

  it('handles missing results at end of conversation', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'exec' }]),
    ];
    const result = repairToolResultPairing(msgs);
    expect(result.length).toBe(3);
    const last = result[2] as unknown as { role: string; isError?: boolean };
    expect(last.role).toBe('toolResult');
    expect(last.isError).toBe(true);
  });

  it('preserves correct ordering with multiple tool calls', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }, { id: 't2', name: 'write' }]),
      toolResult('t1', 'read'),
      toolResult('t2', 'write'),
      assistantMsg('done'),
    ];
    const result = repairToolResultPairing(msgs);
    expect(result).toEqual(msgs);
  });
});

// ============================================================================
// sanitizeHistory (pipeline)
// ============================================================================

describe('sanitizeHistory', () => {
  it('handles empty array', () => {
    expect(sanitizeHistory([])).toEqual([]);
  });

  it('repairs and validates in sequence', () => {
    const msgs = [
      userMsg('a'),
      userMsg('b'),
      assistantWithTools([{ id: 't1', name: 'read' }]),
      userMsg('c'),
      assistantMsg('d'),
    ];
    const result = sanitizeHistory(msgs);
    // After repair: synthetic error inserted for t1 before userMsg 'c'
    // After validate: consecutive user 'a'+'b' merged
    const userMsgs = result.filter((m) => (m as unknown as { role: string }).role === 'user');
    expect(userMsgs.length).toBe(2);
  });
});

// ============================================================================
// toAgentMessages
// ============================================================================

function sessionMsg(role: 'user' | 'assistant' | 'system', content: string): SessionMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionKey: 'test:session',
    role,
    content,
    timestamp: new Date('2025-01-01T00:00:00Z'),
  };
}

describe('toAgentMessages', () => {
  it('returns empty array for empty input', () => {
    expect(toAgentMessages([])).toEqual([]);
  });

  it('converts user messages', () => {
    const result = toAgentMessages([sessionMsg('user', 'hello')]);
    expect(result.length).toBe(1);
    const m = result[0] as unknown as { role: string; content: string };
    expect(m.role).toBe('user');
    expect(m.content).toBe('hello');
  });

  it('converts assistant messages with stub metadata', () => {
    const result = toAgentMessages([sessionMsg('assistant', 'hi back')]);
    expect(result.length).toBe(1);
    const m = result[0] as unknown as { role: string; content: Array<{ type: string; text: string }> };
    expect(m.role).toBe('assistant');
    expect(m.content).toEqual([{ type: 'text', text: 'hi back' }]);
  });

  it('filters out regular system messages', () => {
    const result = toAgentMessages([
      sessionMsg('user', 'a'),
      sessionMsg('system', 'compaction note'),
      sessionMsg('assistant', 'b'),
    ]);
    expect(result.length).toBe(2);
    const roles = result.map(m => (m as unknown as { role: string }).role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('injects subagent_announce system messages as user messages', () => {
    const announce: SessionMessage = {
      id: 'ann-1',
      sessionKey: 'test:session',
      role: 'system',
      content: '[Subagent Complete] status=success\n\nDone.',
      timestamp: new Date('2025-01-01T00:00:00Z'),
      metadata: { type: 'subagent_announce', childSessionKey: 'test:subagent:abc' },
    };
    const result = toAgentMessages([
      sessionMsg('user', 'do stuff'),
      announce,
      sessionMsg('assistant', 'ok synthesized'),
    ]);
    expect(result.length).toBe(3);
    const roles = result.map(m => (m as unknown as { role: string }).role);
    expect(roles).toEqual(['user', 'user', 'assistant']);
    const announceMsg = result[1] as unknown as { role: string; content: string };
    expect(announceMsg.content).toContain('Subagent Complete');
  });

  it('still filters non-announce system messages', () => {
    const announce: SessionMessage = {
      id: 'ann-2',
      sessionKey: 'test:session',
      role: 'system',
      content: 'Result here',
      timestamp: new Date('2025-01-01T00:00:00Z'),
      metadata: { type: 'subagent_announce' },
    };
    const result = toAgentMessages([
      sessionMsg('user', 'a'),
      sessionMsg('system', 'some other system msg'),
      announce,
      sessionMsg('assistant', 'b'),
    ]);
    expect(result.length).toBe(3);
  });
});

// ============================================================================
// truncateToolResults
// ============================================================================

describe('truncateToolResults', () => {
  it('leaves small tool results unchanged', () => {
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }]),
      toolResult('t1', 'read', 'short result'),
    ];
    const result = truncateToolResults(msgs, 128_000);
    expect(result).toBe(msgs); // same reference = no changes
  });

  it('truncates oversized tool results with head+tail', () => {
    // 128K context × 4 chars/token × 0.3 share = 153,600 char limit
    // Create a tool result that exceeds this
    const bigText = 'x'.repeat(200_000);
    const msgs = [
      userMsg('q'),
      assistantWithTools([{ id: 't1', name: 'read' }]),
      msg({
        role: 'toolResult', toolCallId: 't1', toolName: 'read',
        content: [{ type: 'text', text: bigText }], isError: false, timestamp: Date.now(),
      }),
    ];
    const result = truncateToolResults(msgs, 128_000);
    expect(result).not.toBe(msgs);
    const content = (result[2] as unknown as { content: Array<{ text: string }> }).content;
    expect(content[0].text).toContain('...');
    expect(content[0].text).toContain('[Truncated:');
    expect(content[0].text.length).toBeLessThan(bigText.length);
  });

  it('preserves non-toolResult messages', () => {
    const bigText = 'x'.repeat(200_000);
    const msgs = [
      userMsg(bigText), // user message should NOT be truncated
      assistantMsg('ok'),
    ];
    const result = truncateToolResults(msgs, 128_000);
    expect(result).toBe(msgs);
  });
});

// ============================================================================
// pruneToTokenBudget
// ============================================================================

describe('pruneToTokenBudget', () => {
  it('keeps all messages when under budget', () => {
    const msgs = [userMsg('a'), assistantMsg('b')];
    const { messages, droppedCount } = pruneToTokenBudget(msgs, {
      contextWindowTokens: 128_000,
    });
    expect(messages).toBe(msgs);
    expect(droppedCount).toBe(0);
  });

  it('drops oldest messages when over budget', () => {
    // Each message ~250 tokens (1000 chars / 4). Budget = 1000 * 0.5 = 500 tokens.
    const longText = 'x'.repeat(1000);
    const msgs = [
      userMsg(longText),
      assistantMsg(longText),
      userMsg(longText),
      assistantMsg(longText),
    ];
    const { messages, droppedCount } = pruneToTokenBudget(msgs, {
      contextWindowTokens: 1000,
    });
    expect(droppedCount).toBeGreaterThan(0);
    expect(messages.length).toBeLessThan(msgs.length);
    // Kept messages should be the most recent ones
    expect(messages[messages.length - 1]).toBe(msgs[msgs.length - 1]);
  });

  it('respects custom budget ratio', () => {
    const longText = 'x'.repeat(1000);
    const msgs = [userMsg(longText), assistantMsg(longText)];

    // With 0.9 ratio, more budget → keeps more
    const loose = pruneToTokenBudget(msgs, { contextWindowTokens: 1000, budgetRatio: 0.9 });
    // With 0.1 ratio, tighter budget → drops more
    const tight = pruneToTokenBudget(msgs, { contextWindowTokens: 1000, budgetRatio: 0.1 });

    expect(tight.droppedCount).toBeGreaterThanOrEqual(loose.droppedCount);
  });
});

// ============================================================================
// prepareHistory
// ============================================================================

describe('prepareHistory', () => {
  it('returns empty for empty input', () => {
    expect(prepareHistory([], 'whatsapp:123', 128_000)).toEqual([]);
  });

  it('prepends preamble when messages are pruned', () => {
    // Create enough messages to exceed 50% of a small context window
    const msgs: AgentMessage[] = [];
    for (let i = 0; i < 20; i++) {
      msgs.push(userMsg('x'.repeat(500)));
      msgs.push(assistantMsg('y'.repeat(500)));
    }
    // 40 messages × ~125 tokens each = ~5000 tokens. Budget at 2000 * 0.5 = 1000 tokens
    const result = prepareHistory(msgs, 'whatsapp:123', 2000);
    expect(result.length).toBeLessThan(msgs.length);
    // First message should be the preamble
    const first = result[0] as unknown as { content: string };
    expect(first.content).toContain('pruned from history');
  });

  it('skips preamble when everything fits', () => {
    const msgs = [userMsg('hi'), assistantMsg('hello')];
    const result = prepareHistory(msgs, 'whatsapp:123', 128_000);
    const first = result[0] as unknown as { content: string };
    expect(first.content).not.toContain('pruned');
  });

  it('applies turn limit as fallback ceiling', () => {
    // Even if token budget allows it, turn limit should cap
    const msgs: AgentMessage[] = [];
    for (let i = 0; i < 100; i++) {
      msgs.push(userMsg(`msg ${i}`));
      msgs.push(assistantMsg(`reply ${i}`));
    }
    // WhatsApp limit = 30 user turns = ~60 messages max
    const result = prepareHistory(msgs, 'whatsapp:123', 1_000_000);
    const userMsgs = result.filter(m => (m as unknown as { role: string }).role === 'user');
    expect(userMsgs.length).toBeLessThanOrEqual(31); // 30 + possible preamble
  });
});
