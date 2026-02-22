import { describe, it, expect } from 'vitest';
import {
  estimateMessagesTokens,
  computeAdaptiveChunkRatio,
  isOversizedForSummary,
  pruneHistoryForContextShare,
  BASE_CHUNK_RATIO,
  MIN_CHUNK_RATIO,
  __testing,
} from './compaction-safeguard.js';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

function msg(obj: Record<string, unknown>): AgentMessage {
  return obj as unknown as AgentMessage;
}

function userMsg(text: string) {
  return msg({ role: 'user', content: text, timestamp: Date.now() });
}

function assistantMsg(text: string) {
  return msg({ role: 'assistant', content: [{ type: 'text', text }], timestamp: Date.now() });
}

function toolResultMsg(toolName: string, text: string, isError = false) {
  return msg({
    role: 'toolResult',
    toolCallId: `call-${Math.random().toString(36).slice(2)}`,
    toolName,
    content: [{ type: 'text', text }],
    isError,
    timestamp: Date.now(),
  });
}

// ============================================================================
// estimateMessagesTokens
// ============================================================================

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('sums token estimates across messages', () => {
    const msgs = [userMsg('hello'), assistantMsg('world')];
    const tokens = estimateMessagesTokens(msgs);
    expect(tokens).toBeGreaterThan(0);
  });
});

// ============================================================================
// computeAdaptiveChunkRatio
// ============================================================================

describe('computeAdaptiveChunkRatio', () => {
  it('returns BASE_CHUNK_RATIO for empty messages', () => {
    expect(computeAdaptiveChunkRatio([], 100_000)).toBe(BASE_CHUNK_RATIO);
  });

  it('returns BASE_CHUNK_RATIO for small messages', () => {
    const msgs = [userMsg('hi'), assistantMsg('hey')];
    expect(computeAdaptiveChunkRatio(msgs, 200_000)).toBe(BASE_CHUNK_RATIO);
  });

  it('reduces ratio for large messages', () => {
    // Create messages with large content relative to context window
    const msgs = [userMsg('X'.repeat(50_000))];
    const ratio = computeAdaptiveChunkRatio(msgs, 100_000);
    expect(ratio).toBeLessThan(BASE_CHUNK_RATIO);
    expect(ratio).toBeGreaterThanOrEqual(MIN_CHUNK_RATIO);
  });
});

// ============================================================================
// isOversizedForSummary
// ============================================================================

describe('isOversizedForSummary', () => {
  it('returns false for small messages', () => {
    expect(isOversizedForSummary(userMsg('hello'), 200_000)).toBe(false);
  });

  it('returns true for messages larger than 50% of context', () => {
    const bigMsg = userMsg('X'.repeat(200_000));
    expect(isOversizedForSummary(bigMsg, 100_000)).toBe(true);
  });
});

// ============================================================================
// pruneHistoryForContextShare
// ============================================================================

describe('pruneHistoryForContextShare', () => {
  it('returns all messages when within budget', () => {
    const msgs = [userMsg('hi'), assistantMsg('hey')];
    const result = pruneHistoryForContextShare({ messages: msgs, maxContextTokens: 200_000, maxHistoryShare: 0.5 });
    expect(result.messages.length).toBe(2);
    expect(result.dropped.length).toBe(0);
  });

  it('drops oldest chunks when over budget', () => {
    // Create many messages that exceed budget
    const msgs: AgentMessage[] = [];
    for (let i = 0; i < 20; i++) {
      msgs.push(userMsg('X'.repeat(1000)));
      msgs.push(assistantMsg('Y'.repeat(1000)));
    }
    // Budget = 500 tokens = 2000 chars. Total is ~40000 chars = 10000 tokens
    const result = pruneHistoryForContextShare({ messages: msgs, maxContextTokens: 1000, maxHistoryShare: 0.5 });
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(msgs.length);
  });
});

// ============================================================================
// collectToolFailures
// ============================================================================

describe('collectToolFailures', () => {
  const { collectToolFailures } = __testing;

  it('returns empty for no failures', () => {
    const msgs = [userMsg('q'), assistantMsg('a')];
    expect(collectToolFailures(msgs)).toEqual([]);
  });

  it('collects error tool results', () => {
    const msgs = [toolResultMsg('bash', 'command not found', true)];
    const failures = collectToolFailures(msgs);
    expect(failures.length).toBe(1);
    expect(failures[0].toolName).toBe('bash');
    expect(failures[0].summary).toContain('command not found');
  });

  it('deduplicates by toolCallId', () => {
    const result = msg({
      role: 'toolResult', toolCallId: 'same-id', toolName: 'bash',
      content: [{ type: 'text', text: 'err' }], isError: true, timestamp: Date.now(),
    });
    expect(collectToolFailures([result, result]).length).toBe(1);
  });

  it('truncates long failure text', () => {
    const longErr = toolResultMsg('bash', 'E'.repeat(500), true);
    const failures = collectToolFailures([longErr]);
    expect(failures[0].summary.length).toBeLessThanOrEqual(240);
  });
});

// ============================================================================
// formatToolFailures
// ============================================================================

describe('formatToolFailures', () => {
  const { formatToolFailures } = __testing;

  it('returns empty string for no failures', () => {
    expect(formatToolFailures([])).toBe('');
  });

  it('formats failures as markdown list', () => {
    const failures = [{ toolName: 'bash', summary: 'error' }];
    const result = formatToolFailures(failures);
    expect(result).toContain('## Tool Failures');
    expect(result).toContain('- bash: error');
  });

  it('caps at 8 failures', () => {
    const failures = Array.from({ length: 12 }, (_, i) => ({ toolName: `tool${i}`, summary: 'err' }));
    const result = formatToolFailures(failures);
    expect(result).toContain('...and 4 more');
  });
});

// ============================================================================
// chunkByMaxTokens
// ============================================================================

describe('chunkByMaxTokens', () => {
  const { chunkByMaxTokens } = __testing;

  it('returns empty for no messages', () => {
    expect(chunkByMaxTokens([], 100)).toEqual([]);
  });

  it('puts all messages in one chunk if under limit', () => {
    const msgs = [userMsg('hi'), assistantMsg('hey')];
    const chunks = chunkByMaxTokens(msgs, 100_000);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(2);
  });

  it('splits into multiple chunks when messages exceed limit', () => {
    const msgs = [
      userMsg('A'.repeat(1000)),
      userMsg('B'.repeat(1000)),
      userMsg('C'.repeat(1000)),
    ];
    // Each message is ~250 tokens, limit to 300 tokens per chunk
    const chunks = chunkByMaxTokens(msgs, 300);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ============================================================================
// splitByTokenShare
// ============================================================================

describe('splitByTokenShare', () => {
  const { splitByTokenShare } = __testing;

  it('returns empty for no messages', () => {
    expect(splitByTokenShare([], 2)).toEqual([]);
  });

  it('returns single chunk for parts=1', () => {
    const msgs = [userMsg('a'), userMsg('b')];
    expect(splitByTokenShare(msgs, 1).length).toBe(1);
  });

  it('splits into approximately equal parts', () => {
    const msgs = [
      userMsg('A'.repeat(400)),
      userMsg('B'.repeat(400)),
      userMsg('C'.repeat(400)),
      userMsg('D'.repeat(400)),
    ];
    const chunks = splitByTokenShare(msgs, 2);
    expect(chunks.length).toBe(2);
  });
});
