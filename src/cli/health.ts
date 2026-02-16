import { resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { validateConfig } from '../config/validate.js';
import { ServiceClient } from '../client/client.js';
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

  const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
  const hasKey = !!(envKey || config.agent.apiKey);

  const validation = validateConfig(config);

  // Gateway probe
  const host = config.gateway?.host ?? '127.0.0.1';
  const port = config.gateway?.port ?? 9000;
  const url = `ws://${host}:${port}`;

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

  renderHealthCheck({
    config: true,
    agent: config.agent,
    apiKey: hasKey,
    gateway: { url, ok: gatewayOk },
    warnings: validation.warnings,
    errors: validation.errors,
  });
}
