/**
 * Context window management and compaction engine
 * Like OpenClaw's compaction system
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Context window thresholds (like OpenClaw)
export const CONTEXT_WINDOW_HARD_MIN = 16_000;
export const CONTEXT_WINDOW_WARN_BELOW = 32_000;

export interface CompactionResult {
  success: boolean;
  summary?: string;
  remainingMessages: number;
  removedMessages: number;
}

export interface CompactionOptions {
  maxTokens?: number;
  reserveTokens?: number;
  modelContextWindow?: number;
}

/**
 * Estimate token count from text
 * Rough approximation: ~4 chars per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total tokens in conversation
 */
export function calculateConversationTokens(messages: Array<{ content: string; role: string }>): number {
  return messages.reduce((total, msg) => total + estimateTokens(msg.content), 0);
}

/**
 * Check if compaction is needed
 */
export function shouldCompact(
  tokens: number,
  options: { hardMin?: number; warnBelow?: number } = {}
): { needed: boolean; reason?: string } {
  const hardMin = options.hardMin ?? CONTEXT_WINDOW_HARD_MIN;
  const warnBelow = options.warnBelow ?? CONTEXT_WINDOW_WARN_BELOW;

  if (tokens < hardMin) {
    return { needed: true, reason: `Context window critical: ${tokens} tokens (min: ${hardMin})` };
  }
  if (tokens < warnBelow) {
    return { needed: false, reason: `Context window low: ${tokens} tokens (warn: ${warnBelow})` };
  }
  return { needed: false };
}

/**
 * Compaction engine - summarizes conversation history
 * Like OpenClaw's compactEmbeddedPiSessionDirect
 */
export class CompactionEngine {
  private reserveTokens: number;

  constructor(options: { reserveTokens?: number } = {}) {
    this.reserveTokens = options.reserveTokens ?? 4000;
  }

  /**
   * Compact conversation history
   * Keeps: system messages, recent context, summaries older messages
   */
  async compact(
    messages: Array<{ content: string; role: string; timestamp?: Date }>,
    options: { preserveRecent?: number } = {}
  ): Promise<CompactionResult> {
    const preserveRecent = options.preserveRecent ?? 4;
    const originalCount = messages.length;

    if (messages.length <= preserveRecent) {
      return {
        success: true,
        remainingMessages: messages.length,
        removedMessages: 0,
      };
    }

    // Split: recent messages to keep, older messages to summarize
    const recentMessages = messages.slice(-preserveRecent);
    const olderMessages = messages.slice(0, -preserveRecent);

    // Create summary of older messages
    const summary = this.createSummary(olderMessages);

    // New compacted history: summary + recent messages
    const compacted = [
      {
        role: 'system',
        content: `[Prior context summarized]: ${summary}`,
      },
      ...recentMessages,
    ];

    return {
      success: true,
      summary,
      remainingMessages: compacted.length,
      removedMessages: originalCount - compacted.length,
    };
  }

  /**
   * Create a summary of messages
   * In production, this would call an LLM
   */
  private createSummary(
    messages: Array<{ content: string; role: string }>
  ): string {
    // Extract key information
    const keyPoints: string[] = [];
    const decisions: string[] = [];

    for (const msg of messages) {
      const content = msg.content.toLowerCase();

      // Look for decisions
      if (content.includes('decided') || content.includes('decision')) {
        decisions.push(msg.content.slice(0, 200));
      }
      // Look for key context
      else if (content.includes('important') || content.includes('note')) {
        keyPoints.push(msg.content.slice(0, 150));
      }
    }

    const parts: string[] = [];
    if (decisions.length > 0) {
      parts.push(`Key decisions: ${decisions.join('; ')}`);
    }
    if (keyPoints.length > 0) {
      parts.push(`Context: ${keyPoints.join('; ')}`);
    }

    return parts.length > 0
      ? parts.join('. ')
      : `${messages.length} messages of prior conversation`;
  }

  /**
   * Get compaction stats
   */
  getStats(messages: Array<{ content: string }>): {
    totalTokens: number;
    shouldCompact: boolean;
    availableTokens: number;
  } {
    const totalTokens = calculateConversationTokens(messages.map(m => ({ content: m.content, role: 'user' })));
    const { needed } = shouldCompact(totalTokens);
    const availableTokens = Math.max(0, CONTEXT_WINDOW_HARD_MIN - totalTokens);

    return {
      totalTokens,
      shouldCompact: needed,
      availableTokens,
    };
  }
}

/**
 * Session compaction manager
 * Handles auto-compaction for sessions
 */
export class SessionCompactionManager {
  private engine: CompactionEngine;
  private compactionLog: Map<string, number> = new Map(); // sessionKey -> compactionCount

  constructor(options: { reserveTokens?: number } = {}) {
    this.engine = new CompactionEngine(options);
  }

  /**
   * Check and compact if needed
   */
  async checkAndCompact(
    sessionKey: string,
    messages: Array<{ content: string; role: string }>
  ): Promise<CompactionResult | null> {
    const stats = this.engine.getStats(messages);

    if (!stats.shouldCompact) {
      return null;
    }

    const result = await this.engine.compact(messages);

    if (result.success) {
      const count = (this.compactionLog.get(sessionKey) ?? 0) + 1;
      this.compactionLog.set(sessionKey, count);
    }

    return result;
  }

  /**
   * Get compaction count for session
   */
  getCompactionCount(sessionKey: string): number {
    return this.compactionLog.get(sessionKey) ?? 0;
  }
}
