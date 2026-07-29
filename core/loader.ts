/**
 * Service loader — owns service instances and performs hot, in-process reload via
 * cache-busting dynamic import. After `git pull`, `restart(name)` loads the new code
 * from disk without killing the process (same PID).
 *
 * Known leak (see docs/architecture.md § Hot reload): each reload imports a fresh
 * module URL (`?v=<ts>`), and ESM cannot evict the prior generation, so module memory
 * accumulates. dispose() discipline bounds the *resource* leak, not the *module* leak.
 */

import { pathToFileURL } from 'node:url';
import type { EmitterBus } from './bus.js';
import type { Service, ServiceModule } from './types.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('loader');

export interface ServiceSpec {
  name: string;
  /** Absolute path to the service module exporting createService(). */
  modulePath: string;
}

export class ServiceLoader {
  private readonly instances = new Map<string, Service>();
  private readonly specs = new Map<string, ServiceSpec>();

  constructor(private readonly bus: EmitterBus) { }

  names(): string[] {
    return [...this.specs.keys()];
  }

  /** Load a service fresh from disk and run its init(). */
  async load(spec: ServiceSpec): Promise<void> {
    this.specs.set(spec.name, spec);
    const url = pathToFileURL(spec.modulePath).href + '?v=' + Date.now();
    const mod = await import(url) as ServiceModule;
    if (typeof mod.createService !== 'function') {
      throw new Error(`service "${spec.name}" must export createService()`);
    }
    const instance = mod.createService();
    if (instance.name !== spec.name) {
      log.warn(`service module name "${instance.name}" != spec "${spec.name}"`);
    }
    this.instances.set(spec.name, instance);
    this.bus.beginLoading(spec.name);
    try {
      await instance.init(this.bus);
    } finally {
      this.bus.endLoading();
    }
    log.info(`============================== ✅ "${spec.name}" Loaded ==============================`);
  }

  /** Tear down a service: release bus wiring, then dispose its resources. */
  async unload(name: string): Promise<void> {
    const instance = this.instances.get(name);
    this.bus.releaseService(name);
    if (instance) {
      try {
        await instance.dispose();
      } catch (err) {
        log.error(`dispose of "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.instances.delete(name);
  }

  /** Reload one service from disk; other services keep running and retain state. */
  async restart(name: string): Promise<void> {
    const spec = this.specs.get(name);
    if (!spec) throw new Error(`unknown service: ${name}`);
    log.info(`restarting "${name}" — reloading from disk`);
    await this.unload(name);
    await this.load(spec);
  }

  /** Dispose every loaded service (process shutdown / drain). */
  async disposeAll(): Promise<void> {
    await Promise.allSettled([...this.instances.keys()].map(name => this.unload(name)));
  }
}
