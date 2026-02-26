import chalk from 'chalk';
import { pickText } from './pick.js';
import { connectToGateway } from './client.js';
import { cliSessionKey } from '../sessions/keys.js';

export async function run(args?: string[]): Promise<void> {
  let task = args?.join(' ') || '';
  if (!task) {
    if (!process.stdin.isTTY) {
      console.error(chalk.red('  Usage: vargos run <task>'));
      process.exit(1);
    }
    const input = await pickText('Task', { placeholder: 'Describe what you want the agent to do' });
    if (input === null || !input.trim()) return;
    task = input.trim();
  }

  const sessionKey = cliSessionKey('run');
  const client = await connectToGateway();
  client.onDelta((delta) => process.stdout.write(delta));
  client.startThinking();

  try {
    await client.call('sessions', 'session.create', {
      sessionKey, kind: 'cli', metadata: {},
    }).catch(() => {});

    await client.call('sessions', 'session.addMessage', {
      sessionKey, content: task, role: 'user',
    }).catch(() => {});

    const result = await client.call<{ success: boolean; error?: string }>(
      'agent', 'agent.run', { sessionKey, task }, 300_000,
    );
    console.log('');
    if (!result.success) {
      console.error(chalk.red(`  ${result.error ?? 'Agent run failed.'}`));
      process.exit(1);
    }
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  await client.disconnect();
}
