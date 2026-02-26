import chalk from 'chalk';
import { select, isCancel } from '@clack/prompts';
import { connectToGateway } from './client.js';
import { loadAndValidate } from './boot.js';
import { buildSystemPrompt, resolvePromptMode } from '../agent/prompt.js';
import { toAgentMessages, sanitizeHistory, limitHistoryTurns, getHistoryLimit } from '../agent/history.js';
import { loadContextFiles } from '../config/workspace.js';
import type { Session, SessionMessage } from '../sessions/types.js';

const DIM = chalk.dim;
const BOLD = chalk.bold;
const LABEL = chalk.gray;

export async function sessionDebug(args?: string[]): Promise<void> {
  const { workspaceDir } = await loadAndValidate();
  const client = await connectToGateway();

  let sessionKey = args?.[0];
  if (!sessionKey) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('  Usage: vargos sessions debug <session-key>'));
      await client.disconnect();
      process.exit(1);
    }
    const sessions = await client.call<Session[]>('sessions', 'session.list', {});
    if (sessions.length === 0) {
      console.log(chalk.yellow('  No sessions.'));
      await client.disconnect();
      return;
    }
    const choice = await select({
      message: 'Select session',
      options: sessions.map(s => ({ value: s.sessionKey, label: s.sessionKey, hint: s.label || s.kind })),
    });
    if (isCancel(choice)) { await client.disconnect(); return; }
    sessionKey = choice;
  }

  try {
    const [tools, messages, contextFiles] = await Promise.all([
      client.call<Array<{ name: string }>>('tools', 'tool.list', {}),
      client.call<SessionMessage[]>('sessions', 'session.getMessages', { sessionKey }),
      loadContextFiles(workspaceDir),
    ]);

    const toolNames = tools.map(t => t.name);
    const mode = resolvePromptMode(sessionKey);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt({
      mode,
      workspaceDir,
      toolNames,
      contextFiles,
    });

    // Run history pipeline
    const converted = toAgentMessages(messages);
    const sanitized = sanitizeHistory(converted);
    const limit = getHistoryLimit(sessionKey);
    const limited = limitHistoryTurns(sanitized, limit);

    // Print system prompt
    console.log();
    console.log(`  ${BOLD('System Prompt')} ${DIM(`(mode=${mode}, ${systemPrompt.length} chars, ${toolNames.length} tools)`)}`);
    console.log(`  ${DIM('─'.repeat(70))}`);
    console.log(systemPrompt);
    console.log();

    // Print history pipeline stats
    console.log(`  ${BOLD('History')} ${DIM(`(limit=${limit} turns)`)}`);
    console.log(`  ${LABEL('stored')} ${messages.length} → ${LABEL('converted')} ${converted.length} → ${LABEL('sanitized')} ${sanitized.length} → ${LABEL('limited')} ${limited.length}`);
    console.log(`  ${DIM('─'.repeat(70))}`);

    for (const msg of limited) {
      const m = msg as { role: string; content: unknown; timestamp?: number };
      const role = m.role === 'user' ? chalk.cyan('user')
        : m.role === 'assistant' ? chalk.green('assistant')
        : chalk.dim(m.role);
      const ts = m.timestamp ? DIM(new Date(m.timestamp).toLocaleString()) : '';
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? (m.content as Array<{ text?: string }>).map(b => b.text ?? '').join('')
          : String(m.content);
      const truncated = text.slice(0, 500);

      console.log();
      console.log(`  ${role} ${ts} ${DIM(`(${text.length} chars)`)}`);
      console.log(`  ${truncated}`);
      if (text.length > 500) console.log(DIM('  ...truncated'));
    }

    console.log();
  } finally {
    await client.disconnect();
  }
}
