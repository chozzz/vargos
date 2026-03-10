import readline from 'node:readline';
import chalk from 'chalk';
import { connectToGateway } from './client.js';
import { toMessage } from '../lib/error.js';
import { formatToolEvent } from './tool-display.js';

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
  client.onTool((event) => process.stderr.write(formatToolEvent(event)));

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
      console.error(chalk.red(`  Error: ${toMessage(err)}`));
    }
    rl.prompt();
  });

  process.on('SIGINT', async () => {
    rl.close();
    await client.disconnect();
    process.exit(0);
  });

  await new Promise<void>((resolve) => {
    rl.on('close', async () => {
      await client.disconnect();
      resolve();
    });
  });
}
