import chalk from 'chalk';
import { connectToGateway } from './client.js';

export async function run(args?: string[]): Promise<void> {
  const task = args?.join(' ') || '';
  if (!task) {
    console.error(chalk.red('  Usage: vargos run <task>'));
    process.exit(1);
  }

  const client = await connectToGateway();
  client.onDelta((delta) => process.stdout.write(delta));

  try {
    await client.call('agent', 'agent.run', { sessionKey: 'cli:run', task });
    console.log('');
  } catch (err) {
    console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  await client.disconnect();
}
