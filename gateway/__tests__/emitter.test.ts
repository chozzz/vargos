import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EventEmitterBus } from '../emitter.js';
import { on, register } from '../decorators.js';
import type { EventMap } from '../events.js';

describe('EventEmitterBus', () => {
  describe('pure events', () => {
    it('delivers payload to subscriber', () => {
      const bus = new EventEmitterBus();
      const handler = vi.fn();
      bus.on('agent.onCompleted', handler);
      bus.emit('agent.onCompleted', { sessionKey: 'test:123', success: true, response: 'hi' });
      expect(handler).toHaveBeenCalledWith({ sessionKey: 'test:123', success: true, response: 'hi' });
    });

    it('unsubscribe stops delivery', () => {
      const bus = new EventEmitterBus();
      const handler = vi.fn();
      const off = bus.on('agent.onCompleted', handler);
      off();
      bus.emit('agent.onCompleted', { sessionKey: 'x', success: true, response: '' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('callable events', () => {
    it('call routes to handler and returns result', async () => {
      const bus = new EventEmitterBus();

      class ChannelStub {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @register('channel.get', {
          description: 'Get channel',
          schema: z.object({ instanceId: z.string() }),
        })
        async get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']> {
          return {
            instanceId: params.instanceId,
            type:       'telegram',
            status:     'connected',
          };
        }
      }

      new ChannelStub(bus);
      const info = await bus.call('channel.get', { instanceId: 'telegram-1' });
      expect(info.instanceId).toBe('telegram-1');
      expect(info.status).toBe('connected');
    });

    it('call propagates handler errors', async () => {
      const bus = new EventEmitterBus();

      class ChannelStub {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @register('channel.get', {
          description: 'Get channel',
          schema: z.object({ instanceId: z.string() }),
        })
        async get(): Promise<EventMap['channel.get']['result']> {
          throw new Error('not found');
        }
      }

      new ChannelStub(bus);
      await expect(bus.call('channel.get', { instanceId: 'x' })).rejects.toThrow('not found');
    });

    it('call times out when no handler is registered', async () => {
      const bus = new EventEmitterBus(50); // 50ms timeout
      await expect(bus.call('channel.get', { instanceId: 'x' })).rejects.toThrow('timed out');
    });

    it('concurrent calls are isolated by correlationId', async () => {
      const bus = new EventEmitterBus();

      class ChannelStub {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @register('channel.get', {
          description: 'Get channel',
          schema: z.object({ instanceId: z.string() }),
        })
        async get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']> {
          return {
            instanceId: params.instanceId,
            type:       'telegram',
            status:     'connected',
          };
        }
      }

      new ChannelStub(bus);
      const [a, b, c] = await Promise.all([
        bus.call('channel.get', { instanceId: 'a' }),
        bus.call('channel.get', { instanceId: 'b' }),
        bus.call('channel.get', { instanceId: 'c' }),
      ]);
      expect(a.instanceId).toBe('a');
      expect(b.instanceId).toBe('b');
      expect(c.instanceId).toBe('c');
    });
  });

  describe('@on decorator + registerService', () => {
    it('wires pure event handlers', () => {
      const bus = new EventEmitterBus();
      const received: string[] = [];

      class MyService {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @on('agent.onCompleted')
        onCompleted(payload: EventMap['agent.onCompleted']): void {
          received.push(payload.sessionKey);
        }
      }

      new MyService(bus);
      bus.emit('agent.onCompleted', { sessionKey: 'sess:1', success: true });
      bus.emit('agent.onCompleted', { sessionKey: 'sess:2', success: false, error: 'oops' });
      expect(received).toEqual(['sess:1', 'sess:2']);
    });

    it('wires callable event handlers', async () => {
      const bus = new EventEmitterBus();

      class ChannelStub {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @register('channel.get', {
          description: 'Get channel',
          schema: z.object({ instanceId: z.string() }),
        })
        async get(params: EventMap['channel.get']['params']): Promise<EventMap['channel.get']['result']> {
          return {
            instanceId: params.instanceId,
            type:       'whatsapp',
            status:     params.instanceId.includes('heartbeat') ? 'connected' : 'disconnected',
          };
        }
      }

      new ChannelStub(bus);
      const result = await bus.call('channel.get', { instanceId: 'cron:heartbeat' });
      expect(result.instanceId).toBe('cron:heartbeat');
      expect(result.type).toBe('whatsapp');
    });

    it('multiple @on handlers on one service all wire up', () => {
      const bus = new EventEmitterBus();
      const log: string[] = [];

      class ChannelService {
        constructor(b: EventEmitterBus) { b.bootstrap(this); }

        @on('agent.onCompleted')
        onCompleted(_p: EventMap['agent.onCompleted']): void { log.push('completed'); }

        @on('agent.onTool')
        onTool(_p: EventMap['agent.onTool']): void { log.push('tool'); }
      }

      new ChannelService(bus);
      bus.emit('agent.onTool', { sessionKey: 's', toolName: 'read', phase: 'start' });
      bus.emit('agent.onCompleted', { sessionKey: 's', success: true });
      expect(log).toEqual(['tool', 'completed']);
    });
  });
});
