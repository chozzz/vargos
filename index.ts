import { EventEmitterBus } from './gateway/emitter.js';
import * as order from './boot-order.js';

const bus = new EventEmitterBus();
const stoppers: Array<() => unknown> = [];

for (const boot of Object.values(order)) {
  const { stop } = await boot(bus);
  if (stop) stoppers.push(stop);
}

bus.emit('log', { level: 'info', service: 'boot', message: 'vargos v2 ready' });

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

async function shutdown() {
  bus.emit('log', { level: 'info', service: 'boot', message: 'shutting down' });
  await Promise.allSettled(stoppers.map(s => s()));
  process.exit(0);
}
