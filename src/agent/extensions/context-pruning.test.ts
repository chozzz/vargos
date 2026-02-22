import { describe, it, expect } from 'vitest';
import {
  pruneContextMessages,
  resolveSettings,
  estimateMessageChars,
  type ContextPruningSettings,
} from './context-pruning.js';
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

function toolResultMsg(toolName: string, text: string) {
  return msg({
    role: 'toolResult',
    toolCallId: `call-${Math.random().toString(36).slice(2)}`,
    toolName,
    content: [{ type: 'text', text }],
    isError: false,
    timestamp: Date.now(),
  });
}

function toolResultWithImage(toolName: string) {
  return msg({
    role: 'toolResult',
    toolCallId: `call-${Math.random().toString(36).slice(2)}`,
    toolName,
    content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
    isError: false,
    timestamp: Date.now(),
  });
}

const SMALL_WINDOW = 200; // 200 tokens = 800 chars

// ============================================================================
// resolveSettings
// ============================================================================

describe('resolveSettings', () => {
  it('returns defaults with no config', () => {
    const s = resolveSettings();
    expect(s.keepLastAssistants).toBe(3);
    expect(s.softTrimRatio).toBe(0.3);
    expect(s.hardClearRatio).toBe(0.5);
    expect(s.softTrim.maxChars).toBe(4_000);
  });

  it('overrides specific values', () => {
    const s = resolveSettings({ keepLastAssistants: 5, softTrimRatio: 0.2 });
    expect(s.keepLastAssistants).toBe(5);
    expect(s.softTrimRatio).toBe(0.2);
    expect(s.hardClearRatio).toBe(0.5); // default kept
  });

  it('clamps ratios to [0, 1]', () => {
    const s = resolveSettings({ softTrimRatio: 1.5, hardClearRatio: -0.1 });
    expect(s.softTrimRatio).toBe(1);
    expect(s.hardClearRatio).toBe(0);
  });

  it('applies tool filters', () => {
    const s = resolveSettings({ tools: { allow: ['read', 'write'] } });
    expect(s.tools.allow).toEqual(['read', 'write']);
  });
});

// ============================================================================
// estimateMessageChars
// ============================================================================

describe('estimateMessageChars', () => {
  it('estimates user string content', () => {
    expect(estimateMessageChars(userMsg('hello'))).toBe(5);
  });

  it('estimates assistant text blocks', () => {
    expect(estimateMessageChars(assistantMsg('world'))).toBe(5);
  });

  it('estimates tool result text', () => {
    expect(estimateMessageChars(toolResultMsg('read', 'file contents'))).toBe(13);
  });

  it('estimates image content as 8000 chars', () => {
    expect(estimateMessageChars(toolResultWithImage('screenshot'))).toBe(8_000);
  });
});

// ============================================================================
// pruneContextMessages
// ============================================================================

describe('pruneContextMessages', () => {
  const settings: ContextPruningSettings = {
    keepLastAssistants: 1,
    softTrimRatio: 0.3,
    hardClearRatio: 0.5,
    softTrim: { maxChars: 20, headChars: 5, tailChars: 5 },
    tools: {},
  };

  it('returns messages unchanged when context is small', () => {
    const msgs = [userMsg('hi'), assistantMsg('hello')];
    const result = pruneContextMessages(msgs, settings, 10_000);
    expect(result).toBe(msgs); // same reference
  });

  it('returns messages unchanged when no context window', () => {
    const msgs = [userMsg('hi')];
    expect(pruneContextMessages(msgs, settings, 0)).toBe(msgs);
  });

  it('returns messages unchanged with insufficient assistant messages', () => {
    // keepLastAssistants = 1, only 0 assistant messages — no cutoff
    const msgs = [userMsg('hi')];
    expect(pruneContextMessages(msgs, settings, SMALL_WINDOW)).toBe(msgs);
  });

  it('never prunes before first user message', () => {
    // System-level tool results before first user message should be preserved
    const msgs = [
      toolResultMsg('read', 'A'.repeat(200)), // bootstrap read
      userMsg('hi'),
      toolResultMsg('read', 'B'.repeat(200)), // should be prunable
      assistantMsg('response'),
    ];
    // Very small window to force pruning
    const result = pruneContextMessages(msgs, settings, 50);
    // First tool result (before user) should be preserved
    const firstContent = (result[0] as unknown as { content: Array<{ text: string }> }).content;
    expect(firstContent[0].text).toContain('A'.repeat(5)); // at minimum head preserved
    // If pruning happened, the second tool result text should be different from original
    expect(result[0]).toBe(msgs[0]); // same reference — not pruned
  });

  it('soft trims large tool results', () => {
    // softTrim.maxChars=20, so a 107-char tool result gets trimmed
    // softTrimRatio=0.3 → need totalChars / charWindow > 0.3
    // hardClearRatio=0.5 → need totalChars / charWindow < 0.5 to stay in soft trim
    const bigContent = 'START' + 'X'.repeat(100) + 'END!!';
    const msgs = [
      userMsg('do something'),
      toolResultMsg('read', bigContent),
      assistantMsg('done'),
    ];
    // Total chars ~125. softTrimRatio=0.3 → charWindow < 417 → tokens < 105
    // hardClearRatio=0.5 → after soft trim, need ratio < 0.5
    // Soft trim reduces ~107 to ~32 chars → total ~50. Window=80 tokens (320 chars) → ratio 50/320 = 0.15 < 0.5
    const result = pruneContextMessages(msgs, settings, 80);
    const content = (result[1] as unknown as { content: Array<{ text: string }> }).content;
    expect(content[0].text).toContain('...');
    expect(content[0].text).toContain('[Tool result trimmed');
  });

  it('hard clears when ratio exceeds hardClearRatio', () => {
    const msgs = [
      userMsg('do something'),
      toolResultMsg('read', 'X'.repeat(500)),
      toolResultMsg('write', 'Y'.repeat(500)),
      assistantMsg('done'),
    ];
    // Very small window to force hard clear
    const result = pruneContextMessages(msgs, settings, 20);
    const content1 = (result[1] as unknown as { content: Array<{ text: string }> }).content;
    expect(content1[0].text).toContain('[Tool result cleared');
  });

  it('respects tool allow list', () => {
    const settingsWithAllow: ContextPruningSettings = {
      ...settings,
      tools: { allow: ['read'] },
    };
    const msgs = [
      userMsg('do something'),
      toolResultMsg('read', 'X'.repeat(200)),
      toolResultMsg('write', 'Y'.repeat(200)),
      assistantMsg('done'),
    ];
    const result = pruneContextMessages(msgs, settingsWithAllow, 50);
    // 'read' should be pruned
    const readContent = (result[1] as unknown as { content: Array<{ text: string }> }).content;
    expect(readContent[0].text.length).toBeLessThan(200);
    // 'write' should NOT be pruned (not in allow list)
    const writeContent = (result[2] as unknown as { content: Array<{ text: string }> }).content;
    expect(writeContent[0].text).toBe('Y'.repeat(200));
  });

  it('respects tool deny list', () => {
    const settingsWithDeny: ContextPruningSettings = {
      ...settings,
      tools: { deny: ['read'] },
    };
    const msgs = [
      userMsg('do something'),
      toolResultMsg('read', 'X'.repeat(200)),
      toolResultMsg('write', 'Y'.repeat(200)),
      assistantMsg('done'),
    ];
    const result = pruneContextMessages(msgs, settingsWithDeny, 50);
    // 'read' should NOT be pruned (in deny list)
    const readContent = (result[1] as unknown as { content: Array<{ text: string }> }).content;
    expect(readContent[0].text).toBe('X'.repeat(200));
    // 'write' should be pruned
    const writeContent = (result[2] as unknown as { content: Array<{ text: string }> }).content;
    expect(writeContent[0].text.length).toBeLessThan(200);
  });

  it('skips image tool results', () => {
    const msgs = [
      userMsg('do something'),
      toolResultWithImage('screenshot'),
      toolResultMsg('read', 'X'.repeat(200)),
      assistantMsg('done'),
    ];
    const result = pruneContextMessages(msgs, settings, 50);
    // Image tool result should be untouched
    const imgContent = (result[1] as unknown as { content: Array<{ type: string }> }).content;
    expect(imgContent[0].type).toBe('image');
  });

  it('protects last N assistant messages', () => {
    const settingsKeep2: ContextPruningSettings = {
      ...settings,
      keepLastAssistants: 2,
    };
    const msgs = [
      userMsg('q1'),
      toolResultMsg('read', 'X'.repeat(200)),
      assistantMsg('a1'),
      userMsg('q2'),
      toolResultMsg('read', 'Y'.repeat(200)),
      assistantMsg('a2'),
    ];
    const result = pruneContextMessages(msgs, settingsKeep2, 50);
    // The tool result near assistant a2 (last 2 assistants) should be protected
    // Only the first tool result should be pruned
    const firstToolContent = (result[1] as unknown as { content: Array<{ text: string }> }).content;
    const secondToolContent = (result[4] as unknown as { content: Array<{ text: string }> }).content;
    // First is in prunable zone
    expect(firstToolContent[0].text.length).toBeLessThan(200);
    // Second is in protected zone (after cutoff)
    expect(secondToolContent[0].text).toBe('Y'.repeat(200));
  });
});
