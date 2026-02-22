/**
 * Status probe — lightweight gateway client that fetches runtime stats
 * for the CLI menu dashboard. Degrades gracefully when gateway is offline.
 */

import chalk from 'chalk';
import { ServiceClient } from '../gateway/service-client.js';

const DIM = chalk.dim;
const BOLD = chalk.bold;
const CYAN = chalk.cyan;

const noop = () => {};
const silentLog = { debug: noop, info: noop, error: noop, child: <T>(fn: () => T) => fn() };

class StatusProbe extends ServiceClient {
  constructor(gatewayUrl: string) {
    super({
      service: 'status-probe',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl,
    });
    // Suppress connection/disconnection log noise
    (this as unknown as { log: typeof silentLog }).log = silentLog;
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

export interface StatusSnapshot {
  gateway: {
    uptime: number;
    services: number;
    pendingRequests: number;
  };
  agent: {
    totalTokens: { input: number; output: number };
    totalToolCalls: number;
    totalRuns: number;
    activeRuns: number;
  };
  cronTasks: number;
}

export async function fetchStatus(gatewayUrl: string): Promise<StatusSnapshot | null> {
  const probe = new StatusProbe(gatewayUrl);

  try {
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
  } catch {
    return null;
  }

  try {
    const [gateway, agent, cron] = await Promise.all([
      probe.call<StatusSnapshot['gateway']>('gateway', 'gateway.stats', undefined, 3000)
        .catch(() => ({ uptime: 0, services: 0, pendingRequests: 0 })),
      probe.call<StatusSnapshot['agent']>('agent', 'agent.stats', undefined, 3000)
        .catch(() => ({ totalTokens: { input: 0, output: 0 }, totalToolCalls: 0, totalRuns: 0, activeRuns: 0 })),
      probe.call<{ id: string }[]>('cron', 'cron.list', undefined, 3000)
        .catch(() => [] as { id: string }[]),
    ]);

    return {
      gateway,
      agent,
      cronTasks: cron.length,
    };
  } finally {
    await probe.disconnect().catch(() => {});
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function renderStatus(snap: StatusSnapshot | null): string {
  if (!snap) {
    return `  ${DIM('gateway offline')}`;
  }

  const { gateway, agent, cronTasks } = snap;
  const tokIn = formatTokens(agent.totalTokens.input);
  const tokOut = formatTokens(agent.totalTokens.output);
  const uptime = formatUptime(gateway.uptime);

  const lines = [
    '',
    `  ${DIM('Tokens')}  ${CYAN(`${tokIn} in`)} ${DIM('/')} ${CYAN(`${tokOut} out`)}    ${DIM('Runs')}  ${agent.activeRuns > 0 ? BOLD(`${agent.activeRuns} active`) + ' / ' : ''}${CYAN(String(agent.totalRuns))} ${DIM('total')}`,
    `  ${DIM('Tools')}   ${CYAN(String(agent.totalToolCalls))} ${DIM('calls')}           ${DIM('Cron')}  ${CYAN(String(cronTasks))} ${DIM('tasks')}`,
    `  ${DIM('Services')} ${CYAN(String(gateway.services))} ${DIM('connected')}      ${DIM('Uptime')} ${CYAN(uptime)}`,
    '',
  ];

  return lines.join('\n');
}
