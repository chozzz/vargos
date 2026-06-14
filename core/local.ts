/**
 * Local stack — what the CLI boots when no daemon answers on :9000. Loads only the
 * requested service(s) plus config (the common dependency), runs the call, and the
 * caller disposes. Keeps a one-off `vargos channel send ...` from needing a daemon.
 */

import { EmitterBus } from './bus.js';
import { ServiceLoader } from './loader.js';
import { resolveService } from './services.js';
import type { Bus } from './types.js';

export interface LocalStack {
  bus: Bus;
  dispose: () => Promise<void>;
}

export async function bootLocal(serviceNames: string[], rootDir: string, ext: 'ts' | 'js'): Promise<LocalStack> {
  const bus = new EmitterBus();
  const loader = new ServiceLoader(bus);

  // config first, then the requested services (deduped, config never twice). Each name
  // resolves directly to services/<name>/ — only the requested modules are imported.
  const wanted = ['config', ...serviceNames.filter(n => n !== 'config')];
  for (const name of [...new Set(wanted)]) {
    const spec = resolveService(name, rootDir, ext);
    if (!spec) throw new Error(`unknown service: ${name}`);
    await loader.load(spec);
  }

  return { bus, dispose: () => loader.disposeAll() };
}
