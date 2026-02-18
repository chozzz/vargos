export type AgentEvent = 'run.started' | 'run.delta' | 'run.completed';
export type SessionEvent = 'session.created' | 'session.message';
export type ChannelEvent = 'message.received' | 'channel.connected' | 'channel.disconnected';
export type CronEvent = 'cron.trigger';
export type ServiceEvent = AgentEvent | SessionEvent | ChannelEvent | CronEvent;
