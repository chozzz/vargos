import chalk from 'chalk';
import { resolveDataDir, resolveGatewayUrl } from '../config/paths.js';
import { loadConfig, resolveModel } from '../config/pi-config.js';
import { validateConfig } from '../config/validate.js';
import { ServiceClient } from '../gateway/service-client.js';
import { startSpinner } from '../lib/spinner.js';
import { renderHealthCheck } from './banner.js';

class HealthProbe extends ServiceClient {
  constructor(gatewayUrl: string) {
    super({
      service: 'health-check',
      methods: [],
      events: [],
      subscriptions: [],
      gatewayUrl,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(): void {}
}

export async function health(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  if (!config) {
    renderHealthCheck({ config: false, apiKey: false });
    return;
  }

  const primary = resolveModel(config);
  const envKey = process.env[`${primary.provider.toUpperCase()}_API_KEY`];
  const hasKey = !!(envKey || primary.apiKey);

  const validation = validateConfig(config);

  // Gateway probe with spinner
  const url = resolveGatewayUrl(config.gateway);

  const stopSpinner = startSpinner('Checking gateway...');
  let gatewayOk = false;
  try {
    const probe = new HealthProbe(url);
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    gatewayOk = true;
    await probe.disconnect();
  } catch { /* unreachable */ }
  stopSpinner();

  renderHealthCheck({
    config: true,
    profile: { name: config.agent.primary, ...primary },
    apiKey: hasKey,
    gateway: { url, ok: gatewayOk },
    warnings: validation.warnings,
    errors: validation.errors,
  });
}
