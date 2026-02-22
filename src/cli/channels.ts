import chalk from 'chalk';
import { connectToGateway } from './client.js';

export async function send(args?: string[]): Promise<void> {
  if (!args || args.length < 2) {
    console.error(chalk.red('  Usage: vargos channels send <target> <message>'));
    console.error(chalk.gray('  Example: vargos channels send whatsapp:61400000000 "Hello!"'));
    process.exit(1);
  }

  const [target, ...rest] = args;
  const text = rest.join(' ');

  const colonIdx = target.indexOf(':');
  if (colonIdx < 1) {
    console.error(chalk.red('  Invalid target format. Expected <channel>:<userId>'));
    process.exit(1);
  }

  const channel = target.slice(0, colonIdx);
  const userId = target.slice(colonIdx + 1);

  const client = await connectToGateway();

  try {
    await client.call('channel', 'channel.send', { channel, userId, text });
    console.log(chalk.green(`  Sent to ${target}`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`  Send failed: ${msg}`));
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}
