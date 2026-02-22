import chalk from 'chalk';
import { connectToGateway } from './client.js';
import type { WebhookHook, WebhookStatus } from '../webhooks/types.js';

export async function list(): Promise<void> {
  const client = await connectToGateway();

  try {
    const hooks = await client.call<WebhookHook[]>('webhook', 'webhook.list', {});

    if (hooks.length === 0) {
      console.log(chalk.yellow('  No webhooks configured.'));
      return;
    }

    console.log(chalk.bold(`\n  Webhooks (${hooks.length})\n`));
    for (const h of hooks) {
      const desc = h.description ? chalk.gray(` — ${h.description}`) : '';
      const notify = h.notify?.length ? chalk.dim(` → ${h.notify.join(', ')}`) : '';
      console.log(`  ${chalk.cyan(h.id)}${desc}${notify}`);
      console.log(chalk.dim(`    POST /hooks/${h.id}`));
    }
    console.log();
  } finally {
    await client.disconnect();
  }
}

export async function status(): Promise<void> {
  const client = await connectToGateway();

  try {
    const statuses = await client.call<WebhookStatus[]>('webhook', 'webhook.status', {});

    if (statuses.length === 0) {
      console.log(chalk.yellow('  No webhooks configured.'));
      return;
    }

    console.log(chalk.bold(`\n  Webhook Status\n`));
    for (const s of statuses) {
      const desc = s.description ? chalk.gray(` — ${s.description}`) : '';
      const fired = s.lastFired ? new Date(s.lastFired).toLocaleString() : 'never';
      console.log(`  ${chalk.cyan(s.id)}${desc}`);
      console.log(chalk.dim(`    fires: ${s.totalFires}  last: ${fired}`));
    }
    console.log();
  } finally {
    await client.disconnect();
  }
}
