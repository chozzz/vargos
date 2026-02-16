import { describe, it, expect } from 'vitest';
import type { AgentMethod, ToolMethod, SessionMethod, ChannelMethod, CronMethod, GatewayMethod, ServiceMethod } from './methods.js';
import type { AgentEvent, SessionEvent, ChannelEvent, CronEvent, ServiceEvent } from './events.js';

describe('contracts/methods', () => {
  it('agent methods are valid ServiceMethod values', () => {
    const methods: AgentMethod[] = ['agent.run', 'agent.abort', 'agent.status'];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(3);
  });

  it('tool methods are valid ServiceMethod values', () => {
    const methods: ToolMethod[] = ['tool.execute', 'tool.list', 'tool.describe'];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(3);
  });

  it('session methods are valid ServiceMethod values', () => {
    const methods: SessionMethod[] = [
      'session.list', 'session.get', 'session.create',
      'session.delete', 'session.addMessage', 'session.getMessages',
    ];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(6);
  });

  it('channel methods are valid ServiceMethod values', () => {
    const methods: ChannelMethod[] = ['channel.send', 'channel.status', 'channel.list'];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(3);
  });

  it('cron methods are valid ServiceMethod values', () => {
    const methods: CronMethod[] = ['cron.list', 'cron.add', 'cron.remove', 'cron.run'];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(4);
  });

  it('gateway methods are valid ServiceMethod values', () => {
    const methods: GatewayMethod[] = ['gateway.register'];
    const asService: ServiceMethod[] = methods;
    expect(asService).toHaveLength(1);
  });
});

describe('contracts/events', () => {
  it('all service events are valid', () => {
    const events: ServiceEvent[] = [
      'run.started', 'run.delta', 'run.completed',
      'session.created', 'session.message',
      'message.received', 'channel.connected', 'channel.disconnected',
      'cron.trigger',
    ];
    expect(events).toHaveLength(9);
  });

  it('agent events are valid ServiceEvent values', () => {
    const events: AgentEvent[] = ['run.started', 'run.delta', 'run.completed'];
    const asService: ServiceEvent[] = events;
    expect(asService).toHaveLength(3);
  });

  it('session events are valid ServiceEvent values', () => {
    const events: SessionEvent[] = ['session.created', 'session.message'];
    const asService: ServiceEvent[] = events;
    expect(asService).toHaveLength(2);
  });

  it('channel events are valid ServiceEvent values', () => {
    const events: ChannelEvent[] = ['message.received', 'channel.connected', 'channel.disconnected'];
    const asService: ServiceEvent[] = events;
    expect(asService).toHaveLength(3);
  });

  it('cron events are valid ServiceEvent values', () => {
    const events: CronEvent[] = ['cron.trigger'];
    const asService: ServiceEvent[] = events;
    expect(asService).toHaveLength(1);
  });
});
