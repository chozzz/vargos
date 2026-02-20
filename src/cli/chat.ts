import readline from 'node:readline';
import chalk from 'chalk';
import { connectToGateway } from './client.js';

const SESSION_KEY = 'cli:chat';

export async function chat(): Promise<void> {
  const client = await connectToGateway();

  await client.call('sessions', 'session.create', {
    sessionKey: SESSION_KEY, kind: 'cli', metadata: {},
  }).catch(() => {}); // ignore if already exists

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

    await client.call('sessions', 'session.addMessage', {
      sessionKey: SESSION_KEY, content: msg, role: 'user',
    }).catch(() => {});

    client.startThinking();
    try {
      const result = await client.call<{ success: boolean; error?: string }>(
        'agent', 'agent.run', { sessionKey: SESSION_KEY, task: msg }, 300_000,
      );
      console.log('');
      if (!result.success) {
        console.error(chalk.red(`  ${result.error ?? 'Agent run failed.'}`));
      }
    } catch (err) {
      console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
    }
    rl.prompt();
  });

  const cleanup = async () => {
    rl.close();
    await client.disconnect();
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  // Keep alive until readline closes (Ctrl+D)
  await new Promise<void>((resolve) => {
    rl.on('close', async () => {
      await client.disconnect();
      resolve();
    });
  });
}
