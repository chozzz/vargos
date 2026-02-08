import chalk from 'chalk';
import { readGatewayPid } from '../pid.js';

export async function status(): Promise<void> {
  const pid = await readGatewayPid();
  if (!pid) {
    console.log(chalk.yellow('  Gateway is not running.'));
    return;
  }
  console.log(chalk.green(`  Gateway is running (PID: ${pid}).`));
}
