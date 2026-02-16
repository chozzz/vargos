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
  const exited = await waitForExit(pid, 5000);

  if (exited) {
    console.log(chalk.green('  Gateway stopped.'));
    return;
  }

  // Escalate to SIGKILL
  console.log(chalk.yellow('  Graceful shutdown timed out, force-killing...'));
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  const killed = await waitForExit(pid, 3000);

  if (killed) {
    console.log(chalk.green('  Gateway force-killed.'));
  } else {
    console.log(chalk.red(`  Failed to stop gateway (PID: ${pid}). Kill manually.`));
  }
}
