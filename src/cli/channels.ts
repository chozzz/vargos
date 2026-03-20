import chalk from 'chalk';
import { connectToGateway } from './client.js';
import { toMessage } from '../lib/error.js';

export async function send(args?: string[]): Promise<void> {
  if (!args || args.length < 2) {
    console.error(chalk.red('  Usage: vargos channels send <target> <message>'));
    console.error(chalk.gray('  Example: vargos channels send whatsapp:61400000000 "Hello!"'));
    console.error(chalk.gray('  Example: vargos channels send telegram:123456789 "Hello!"'));
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
    const msg = toMessage(err);
    console.error(chalk.red(`  Send failed: ${msg}`));
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

export async function setup(args?: string[]): Promise<void> {
  const { setupWhatsApp, setupTelegram } = await import('./onboard-channels.js');

  if (args?.[0] === 'whatsapp') {
    await setupWhatsApp();
    return;
  }
  if (args?.[0] === 'telegram') {
    await setupTelegram();
    return;
  }

  // Interactive if no args
  const channel = args?.[0];
  if (channel === 'whatsapp') {
    await setupWhatsApp();
  } else if (channel === 'telegram') {
    await setupTelegram();
  } else {
    console.log(chalk.cyan('\n  Channel Setup\n'));
    console.log('  Usage:');
    console.log('    vargos channels setup whatsapp   Scan QR code to connect WhatsApp');
    console.log('    vargos channels setup telegram   Enter bot token to connect Telegram\n');
    console.log('  Examples:');
    console.log('    vargos channels setup whatsapp');
    console.log('    vargos channels setup telegram\n');
    console.log('  For WhatsApp: You will see a QR code to scan with your phone.');
    console.log('  For Telegram: You will be prompted for your bot token from @BotFather.\n');
  }
}

export async function setupTelegram(): Promise<void> {
  const { setupTelegram } = await import('./onboard-channels.js');
  await setupTelegram();
}

export async function setupWhatsApp(): Promise<void> {
  const { setupWhatsApp } = await import('./onboard-channels.js');
  await setupWhatsApp();
}
