export type AgentMethod = 'agent.run' | 'agent.abort' | 'agent.status';
export type ToolMethod = 'tool.execute' | 'tool.list' | 'tool.describe';
export type SessionMethod = 'session.list' | 'session.get' | 'session.create'
  | 'session.delete' | 'session.addMessage' | 'session.getMessages';
export type ChannelMethod = 'channel.send' | 'channel.status' | 'channel.list';
export type CronMethod = 'cron.list' | 'cron.add' | 'cron.remove' | 'cron.update' | 'cron.run';
export type GatewayMethod = 'gateway.register';
export type ServiceMethod = AgentMethod | ToolMethod | SessionMethod
  | ChannelMethod | CronMethod | GatewayMethod;

export type AgentEvent = 'run.started' | 'run.delta' | 'run.completed';
export type SessionEvent = 'session.created' | 'session.message';
export type ChannelEvent = 'message.received' | 'channel.connected' | 'channel.disconnected';
export type CronEvent = 'cron.trigger';
export type ServiceEvent = AgentEvent | SessionEvent | ChannelEvent | CronEvent;
