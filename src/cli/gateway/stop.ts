import chalk from 'chalk';
import { readGatewayPid, waitForExit } from '../pid.js';

export async function stop(): Promise<void> {
  const pid = await readGatewayPid();
  if (!pid) {
    console.log(chalk.yellow('  No running gateway found.'));
    return;
  }

  console.log(`  Stopping gateway (PID: ${pid})...`);
  process.kill(pid, 'SIGTERM');
  const exited = await waitForExit(pid);
  if (exited) {
    console.log(chalk.green('  Gateway stopped.'));
  } else {
    console.log(chalk.red('  Gateway did not stop in time.'));
  }
}
