import readline from 'node:readline';
import chalk from 'chalk';
import { connectToGateway } from './client.js';

export async function chat(): Promise<void> {
  const client = await connectToGateway();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('  > '),
  });

  client.onDelta((delta) => process.stdout.write(delta));

  console.log(chalk.gray('  Type a message to chat. Ctrl+C to exit.\n'));
  rl.prompt();

  rl.on('line', async (line) => {
    const msg = line.trim();
    if (!msg) { rl.prompt(); return; }

    try {
      await client.call('agent', 'agent.run', { sessionKey: 'cli:chat', task: msg });
      console.log(''); // newline after streaming deltas
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    }
    rl.prompt();
  });

  rl.on('close', async () => {
    await client.disconnect();
    process.exit(0);
  });
}
