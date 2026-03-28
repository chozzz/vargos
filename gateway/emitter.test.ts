import { describe, it, expect, vi } from 'vitest';
import { EventEmitterBus } from './emitter.js';
import { on } from './decorators.js';
import type { EventMap } from './events.js';

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
      bus.emit('agent.onCompleted', { sessionKey: 'x', success: true });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('callable events', () => {
    it('call routes to handler and returns result', async () => {
      const bus = new EventEmitterBus();
      bus.on('session.get', async (params) => ({
        sessionKey: params.sessionKey,
        kind: 'main' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const session = await bus.call('session.get', { sessionKey: 'telegram:123' });
      expect(session.sessionKey).toBe('telegram:123');
    });

    it('call propagates handler errors', async () => {
      const bus = new EventEmitterBus();
      bus.on('session.get', async () => { throw new Error('not found'); });
      await expect(bus.call('session.get', { sessionKey: 'x' })).rejects.toThrow('not found');
    });

    it('call times out when no handler is registered', async () => {
      const bus = new EventEmitterBus(50); // 50ms timeout
      await expect(bus.call('session.get', { sessionKey: 'x' })).rejects.toThrow("timed out");
    });

    it('concurrent calls are isolated by correlationId', async () => {
      const bus = new EventEmitterBus();
      bus.on('session.get', async (params) => ({
        sessionKey: params.sessionKey,
        kind: 'main' as const,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const [a, b, c] = await Promise.all([
        bus.call('session.get', { sessionKey: 'a' }),
        bus.call('session.get', { sessionKey: 'b' }),
        bus.call('session.get', { sessionKey: 'c' }),
      ]);
      expect(a.sessionKey).toBe('a');
      expect(b.sessionKey).toBe('b');
      expect(c.sessionKey).toBe('c');
    });
  });

  describe('@on decorator + registerService', () => {
    it('wires pure event handlers', () => {
      const bus = new EventEmitterBus();
      const received: string[] = [];

      class MyService {
        constructor(b: EventEmitterBus) { b.registerService(this); }

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

      class SessionService {
        constructor(b: EventEmitterBus) { b.registerService(this); }

        @on('session.get')
        async get(params: EventMap['session.get']['params']): Promise<EventMap['session.get']['result']> {
          return {
            sessionKey: params.sessionKey,
            kind:       'cron',
            metadata:   { taskId: 'heartbeat' },
            createdAt:  new Date(),
            updatedAt:  new Date(),
          };
        }
      }

      new SessionService(bus);
      const result = await bus.call('session.get', { sessionKey: 'cron:heartbeat' });
      expect(result.metadata.taskId).toBe('heartbeat');
    });

    it('multiple @on handlers on one service all wire up', () => {
      const bus = new EventEmitterBus();
      const log: string[] = [];

      class ChannelService {
        constructor(b: EventEmitterBus) { b.registerService(this); }

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
