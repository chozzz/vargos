/**
 * Compaction safeguard — multi-stage hierarchical summarization with metadata.
 * Hooks Pi SDK's session_before_compact event to replace default compaction.
 *
 * Adapted from OpenClaw's compaction engine for Vargos architecture.
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import {
  estimateTokens,
  generateSummary,
  type CompactionResult,
  type ExtensionAPI,
  type ExtensionContext,
} from '@mariozechner/pi-coding-agent';
import type { CompactionSafeguardConfig } from '../../config/pi-config.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('compaction');

// -- Constants (proven in OpenClaw) --

export const BASE_CHUNK_RATIO = 0.4;
export const MIN_CHUNK_RATIO = 0.15;
export const SAFETY_MARGIN = 1.2;
const DEFAULT_SUMMARY_FALLBACK = 'No prior history.';
const FALLBACK_SUMMARY = 'Summary unavailable due to context limits. Older messages were truncated.';
const MAX_TOOL_FAILURES = 8;
const MAX_TOOL_FAILURE_CHARS = 240;

// -- Token estimation --

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
}

// -- Adaptive chunking --

export function computeAdaptiveChunkRatio(messages: AgentMessage[], contextWindow: number): number {
  if (messages.length === 0) return BASE_CHUNK_RATIO;

  const totalTokens = estimateMessagesTokens(messages);
  const avgTokens = totalTokens / messages.length;
  const safeAvg = avgTokens * SAFETY_MARGIN;
  const avgRatio = safeAvg / contextWindow;

  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }
  return BASE_CHUNK_RATIO;
}

export function isOversizedForSummary(msg: AgentMessage, contextWindow: number): boolean {
  return estimateTokens(msg) * SAFETY_MARGIN > contextWindow * 0.5;
}

// -- Chunking --

function chunkByMaxTokens(messages: AgentMessage[], maxTokens: number): AgentMessage[][] {
  if (messages.length === 0) return [];
  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const t = estimateTokens(msg);
    if (current.length > 0 && currentTokens + t > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(msg);
    currentTokens += t;
    if (t > maxTokens) { chunks.push(current); current = []; currentTokens = 0; }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function splitByTokenShare(messages: AgentMessage[], parts: number): AgentMessage[][] {
  if (messages.length === 0) return [];
  const p = Math.min(Math.max(1, Math.floor(parts)), messages.length);
  if (p <= 1) return [messages];

  const totalTokens = estimateMessagesTokens(messages);
  const target = totalTokens / p;
  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const t = estimateTokens(msg);
    if (chunks.length < p - 1 && current.length > 0 && currentTokens + t > target) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(msg);
    currentTokens += t;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// -- Summarization --

async function summarizeChunks(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext['model']>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;

  const chunks = chunkByMaxTokens(params.messages, params.maxChunkTokens);
  let summary = params.previousSummary;

  for (const chunk of chunks) {
    summary = await generateSummary(
      chunk, params.model, params.reserveTokens, params.apiKey, params.signal, params.customInstructions, summary,
    );
  }
  return summary ?? DEFAULT_SUMMARY_FALLBACK;
}

export async function summarizeWithFallback(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext['model']>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
}): Promise<string> {
  if (params.messages.length === 0) return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;

  try {
    return await summarizeChunks(params);
  } catch (err) {
    log.info(`full summarization failed, trying partial: ${err instanceof Error ? err.message : err}`);
  }

  // Fallback: exclude oversized messages
  const small: AgentMessage[] = [];
  const notes: string[] = [];
  for (const msg of params.messages) {
    if (isOversizedForSummary(msg, params.contextWindow)) {
      const role = (msg as { role?: string }).role ?? 'message';
      notes.push(`[Large ${role} (~${Math.round(estimateTokens(msg) / 1000)}K tokens) omitted from summary]`);
    } else {
      small.push(msg);
    }
  }

  if (small.length > 0) {
    try {
      const partial = await summarizeChunks({ ...params, messages: small });
      return notes.length > 0 ? `${partial}\n\n${notes.join('\n')}` : partial;
    } catch (err) {
      log.info(`partial summarization also failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return `Context contained ${params.messages.length} messages (${notes.length} oversized). Summary unavailable due to size limits.`;
}

export async function summarizeInStages(params: {
  messages: AgentMessage[];
  model: NonNullable<ExtensionContext['model']>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  maxChunkTokens: number;
  contextWindow: number;
  customInstructions?: string;
  previousSummary?: string;
  parts?: number;
}): Promise<string> {
  const { messages } = params;
  if (messages.length === 0) return params.previousSummary ?? DEFAULT_SUMMARY_FALLBACK;

  const parts = Math.min(Math.max(1, Math.floor(params.parts ?? 2)), messages.length);
  const totalTokens = estimateMessagesTokens(messages);

  if (parts <= 1 || messages.length < 4 || totalTokens <= params.maxChunkTokens) {
    return summarizeWithFallback(params);
  }

  const splits = splitByTokenShare(messages, parts).filter(c => c.length > 0);
  if (splits.length <= 1) return summarizeWithFallback(params);

  const partials: string[] = [];
  for (const chunk of splits) {
    partials.push(await summarizeWithFallback({ ...params, messages: chunk, previousSummary: undefined }));
  }
  if (partials.length === 1) return partials[0];

  // Merge partial summaries
  const mergeMessages: AgentMessage[] = partials.map(s => ({
    role: 'user', content: s, timestamp: Date.now(),
  } as AgentMessage));

  const mergeInstructions = params.customInstructions
    ? `Merge these partial summaries into a single cohesive summary. Preserve decisions, TODOs, open questions, and any constraints.\n\nAdditional focus:\n${params.customInstructions}`
    : 'Merge these partial summaries into a single cohesive summary. Preserve decisions, TODOs, open questions, and any constraints.';

  return summarizeWithFallback({ ...params, messages: mergeMessages, customInstructions: mergeInstructions });
}

// -- Metadata collection --

interface ToolFailure {
  toolName: string;
  summary: string;
}

function collectToolFailures(messages: AgentMessage[]): ToolFailure[] {
  const failures: ToolFailure[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const m = msg as { role?: string; toolCallId?: string; toolName?: string; content?: unknown; isError?: boolean };
    if (m.role !== 'toolResult' || m.isError !== true) continue;
    if (!m.toolCallId || seen.has(m.toolCallId)) continue;
    seen.add(m.toolCallId);

    const rawText = extractToolResultText(m.content);
    const normalized = rawText.replace(/\s+/g, ' ').trim();
    const summary = normalized.length > MAX_TOOL_FAILURE_CHARS
      ? `${normalized.slice(0, MAX_TOOL_FAILURE_CHARS - 3)}...`
      : normalized || 'failed (no output)';

    failures.push({ toolName: m.toolName ?? 'tool', summary });
  }
  return failures;
}

function extractToolResultText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n');
}

function formatToolFailures(failures: ToolFailure[]): string {
  if (failures.length === 0) return '';
  const lines = failures.slice(0, MAX_TOOL_FAILURES).map(f => `- ${f.toolName}: ${f.summary}`);
  if (failures.length > MAX_TOOL_FAILURES) lines.push(`- ...and ${failures.length - MAX_TOOL_FAILURES} more`);
  return `\n\n## Tool Failures\n${lines.join('\n')}`;
}

// -- History pruning for context share --

export function pruneHistoryForContextShare(params: {
  messages: AgentMessage[];
  maxContextTokens: number;
  maxHistoryShare: number;
}): { messages: AgentMessage[]; dropped: AgentMessage[] } {
  const budget = Math.max(1, Math.floor(params.maxContextTokens * params.maxHistoryShare));
  let kept = params.messages;
  const allDropped: AgentMessage[] = [];

  while (kept.length > 0 && estimateMessagesTokens(kept) > budget) {
    const chunks = splitByTokenShare(kept, 2);
    if (chunks.length <= 1) break;
    const [dropped, ...rest] = chunks;
    allDropped.push(...dropped);
    kept = rest.flat();
  }

  return { messages: kept, dropped: allDropped };
}

// -- Extension factory --

function resolveContextWindow(ctx: ExtensionContext): number {
  return Math.max(1, Math.floor(ctx.model?.contextWindow ?? 128_000));
}

/**
 * Create the compaction safeguard Pi SDK extension.
 * Hooks session_before_compact to provide richer summarization with metadata.
 */
export function createCompactionSafeguardExtension(cfg?: CompactionSafeguardConfig): (api: ExtensionAPI) => void {
  const maxHistoryShare = cfg?.maxHistoryShare ?? 0.5;

  return (api: ExtensionAPI) => {
    api.on('session_before_compact', async (event, ctx) => {
      const { preparation, customInstructions, signal } = event;
      const allMessages = [...preparation.messagesToSummarize, ...(preparation.turnPrefixMessages ?? [])];
      const toolFailures = collectToolFailures(allMessages);
      const toolFailureSection = formatToolFailures(toolFailures);
      const fallback = `${FALLBACK_SUMMARY}${toolFailureSection}`;

      const model = ctx.model;
      if (!model) {
        return { compaction: { summary: fallback, firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore } };
      }

      const apiKey = await ctx.modelRegistry.getApiKey(model);
      if (!apiKey) {
        return { compaction: { summary: fallback, firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore } };
      }

      try {
        const contextWindow = resolveContextWindow(ctx);
        let messagesToSummarize = preparation.messagesToSummarize;
        let droppedSummary: string | undefined;

        // Prune history if new content dominates context
        const tokensBefore = preparation.tokensBefore;
        if (typeof tokensBefore === 'number' && Number.isFinite(tokensBefore)) {
          const summarizableTokens = estimateMessagesTokens(messagesToSummarize) + estimateMessagesTokens(preparation.turnPrefixMessages ?? []);
          const newContentTokens = Math.max(0, tokensBefore - summarizableTokens);
          const maxHistoryTokens = Math.floor(contextWindow * maxHistoryShare * SAFETY_MARGIN);

          if (newContentTokens > maxHistoryTokens) {
            const pruned = pruneHistoryForContextShare({ messages: messagesToSummarize, maxContextTokens: contextWindow, maxHistoryShare });
            if (pruned.dropped.length > 0) {
              log.info(`compaction safeguard: dropped ${pruned.dropped.length} older messages to fit history budget`);
              messagesToSummarize = pruned.messages;

              try {
                const ratio = computeAdaptiveChunkRatio(pruned.dropped, contextWindow);
                const maxChunk = Math.max(1, Math.floor(contextWindow * ratio));
                droppedSummary = await summarizeInStages({
                  messages: pruned.dropped, model, apiKey, signal,
                  reserveTokens: Math.max(1, Math.floor(preparation.settings.reserveTokens)),
                  maxChunkTokens: maxChunk, contextWindow, customInstructions, previousSummary: preparation.previousSummary,
                });
              } catch (err) {
                log.info(`failed to summarize dropped messages: ${err instanceof Error ? err.message : err}`);
              }
            }
          }
        }

        const adaptiveRatio = computeAdaptiveChunkRatio([...messagesToSummarize, ...(preparation.turnPrefixMessages ?? [])], contextWindow);
        const maxChunkTokens = Math.max(1, Math.floor(contextWindow * adaptiveRatio));
        const reserveTokens = Math.max(1, Math.floor(preparation.settings.reserveTokens));

        const summary = await summarizeInStages({
          messages: messagesToSummarize, model, apiKey, signal, reserveTokens, maxChunkTokens, contextWindow,
          customInstructions, previousSummary: droppedSummary ?? preparation.previousSummary,
        });

        return {
          compaction: {
            summary: summary + toolFailureSection,
            firstKeptEntryId: preparation.firstKeptEntryId,
            tokensBefore: preparation.tokensBefore,
          } as CompactionResult,
        };
      } catch (err) {
        log.info(`compaction summarization failed: ${err instanceof Error ? err.message : err}`);
        return { compaction: { summary: fallback, firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore } };
      }
    });
  };
}

// Export internals for testing
export const __testing = {
  collectToolFailures,
  formatToolFailures,
  extractToolResultText,
  chunkByMaxTokens,
  splitByTokenShare,
  summarizeChunks,
} as const;
