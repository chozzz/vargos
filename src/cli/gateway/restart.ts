import chalk from 'chalk';
import { readGatewayPid } from '../pid.js';

export async function restart(): Promise<void> {
  const pid = await readGatewayPid();
  if (!pid) {
    console.log(chalk.yellow('  No running gateway found.'));
    return;
  }

  console.log(`  Restarting gateway (PID: ${pid})...`);
  process.kill(pid, 'SIGUSR2');
  console.log(chalk.green('  Restart signal sent.'));
}
