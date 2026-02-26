import chalk from 'chalk';
import { connectToGateway } from './client.js';
import type { Session, SessionMessage } from '../sessions/types.js';

export async function list(): Promise<void> {
  const client = await connectToGateway();

  try {
    const sessions = await client.call<Session[]>('sessions', 'session.list', {});

    if (sessions.length === 0) {
      console.log(chalk.yellow('  No sessions.'));
      return;
    }

    console.log();
    for (const s of sessions) {
      const age = timeSince(new Date(s.updatedAt));
      const kind = chalk.dim(`[${s.kind}]`);
      const label = s.label ? chalk.gray(` ${s.label}`) : '';
      console.log(`  ${chalk.bold(s.sessionKey)} ${kind}${label}  ${chalk.dim(age)}`);
    }
    console.log();
  } finally {
    await client.disconnect();
  }
}

export async function history(args?: string[]): Promise<void> {
  let sessionKey = args?.[0];
  const client = await connectToGateway();

  if (!sessionKey) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('  Usage: vargos sessions history <session-key>'));
      process.exit(1);
    }
    const { select, isCancel } = await import('@clack/prompts');
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
    const messages = await client.call<SessionMessage[]>('sessions', 'session.getMessages', { sessionKey });

    if (messages.length === 0) {
      console.log(chalk.yellow('  No messages in session.'));
      return;
    }

    console.log();
    for (const m of messages) {
      const role = m.role === 'user' ? chalk.cyan('user')
        : m.role === 'assistant' ? chalk.green('assistant')
        : chalk.dim('system');
      const ts = chalk.dim(new Date(m.timestamp).toLocaleString());
      console.log(`  ${role} ${ts}`);
      console.log(`  ${m.content.slice(0, 500)}`);
      if (m.content.length > 500) console.log(chalk.dim('  ...truncated'));
      console.log();
    }
  } finally {
    await client.disconnect();
  }
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
