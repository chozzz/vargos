import chalk from 'chalk';
import { connectToGateway } from './client.js';

const SESSION_KEY = 'cli:run';

export async function run(args?: string[]): Promise<void> {
  const task = args?.join(' ') || '';
  if (!task) {
    console.error(chalk.red('  Usage: vargos run <task>'));
    process.exit(1);
  }

  const client = await connectToGateway();
  client.onDelta((delta) => process.stdout.write(delta));
  client.startThinking();

  try {
    await client.call('sessions', 'session.create', {
      sessionKey: SESSION_KEY, kind: 'cli', metadata: {},
    }).catch(() => {}); // ignore if already exists

    const result = await client.call<{ success: boolean; error?: string }>(
      'agent', 'agent.run', { sessionKey: SESSION_KEY, task }, 300_000,
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
