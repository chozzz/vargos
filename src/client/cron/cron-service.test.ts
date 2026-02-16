import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayServer } from '../../gateway/server.js';
import { ServiceClient } from '../client.js';
import { CronService, type CronTask } from './index.js';

const PORT = 19804;
const GATEWAY_URL = `ws://127.0.0.1:${PORT}`;

class TestSubscriber extends ServiceClient {
  events: Array<{ event: string; payload: unknown }> = [];

  constructor() {
    super({
      service: 'subscriber',
      methods: [],
      events: [],
      subscriptions: ['cron.trigger'],
      gatewayUrl: GATEWAY_URL,
    });
  }
  async handleMethod(): Promise<unknown> { throw new Error('not implemented'); }
  handleEvent(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

describe('CronService', () => {
  let gateway: GatewayServer;
  let cron: CronService;
  let subscriber: TestSubscriber;

  beforeEach(async () => {
    gateway = new GatewayServer({ port: PORT, host: '127.0.0.1', requestTimeout: 5000, pingInterval: 60_000 });
    await gateway.start();

    cron = new CronService({ gatewayUrl: GATEWAY_URL });
    await cron.connect();

    subscriber = new TestSubscriber();
    await subscriber.connect();
  });

  afterEach(async () => {
    cron.stopAll();
    await subscriber.disconnect();
    await cron.disconnect();
    await gateway.stop();
  });

  it('adds and lists tasks via gateway', async () => {
    const task = await subscriber.call<CronTask>('cron', 'cron.add', {
      name: 'test',
      schedule: '0 * * * *',
      description: 'hourly test',
      task: 'do stuff',
      enabled: false,
    });

    expect(task.id).toBeTruthy();
    expect(task.name).toBe('test');

    const tasks = await subscriber.call<CronTask[]>('cron', 'cron.list');
    expect(tasks.length).toBe(1);
    expect(tasks[0].name).toBe('test');
  });

  it('removes tasks via gateway', async () => {
    const task = await subscriber.call<CronTask>('cron', 'cron.add', {
      name: 'removable',
      schedule: '0 * * * *',
      description: 'will be removed',
      task: 'nothing',
      enabled: false,
    });

    await subscriber.call('cron', 'cron.remove', { id: task.id });

    const tasks = await subscriber.call<CronTask[]>('cron', 'cron.list');
    expect(tasks.length).toBe(0);
  });

  it('returns false when removing a nonexistent task', async () => {
    const result = await subscriber.call<boolean>('cron', 'cron.remove', { id: 'nonexistent-id' });
    expect(result).toBe(false);
  });

  it('throws when running a nonexistent task', async () => {
    await expect(
      subscriber.call('cron', 'cron.run', { id: 'nonexistent-id' }),
    ).rejects.toThrow('No task with id: nonexistent-id');
  });

  it('emits cron.trigger on manual run', async () => {
    const task = await subscriber.call<CronTask>('cron', 'cron.add', {
      name: 'trigger-test',
      schedule: '0 * * * *',
      description: 'test trigger',
      task: 'analyze workspace',
      enabled: false,
    });

    await subscriber.call('cron', 'cron.run', { id: task.id });

    // Wait for event
    await new Promise((r) => setTimeout(r, 100));

    const trigger = subscriber.events.find((e) => e.event === 'cron.trigger');
    expect(trigger).toBeDefined();
    expect((trigger!.payload as any).taskId).toBe(task.id);
    expect((trigger!.payload as any).task).toBe('analyze workspace');
    expect((trigger!.payload as any).sessionKey).toMatch(/^cron:/);
  });
});
