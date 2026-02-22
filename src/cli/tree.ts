/** Menu tree — single data structure drives both interactive menus and CLI routing */

export interface MenuGroup {
  kind: 'group';
  label: string;
  children: MenuNode[];
}

export interface MenuLeaf {
  kind: 'leaf';
  label: string;
  hint?: string;
  hidden?: boolean;
  action: (args?: string[]) => Promise<void>;
}

export type MenuNode = (MenuGroup | MenuLeaf) & { key: string };

export function isGroup(node: MenuNode): node is MenuGroup & { key: string } {
  return node.kind === 'group';
}

export function buildTree(): MenuNode[] {
  return [
    {
      key: 'chat',
      kind: 'leaf',
      label: 'Chat',
      hint: 'Interactive chat session',
      action: async () => { const m = await import('./chat.js'); await m.chat(); },
    },
    {
      key: 'run',
      kind: 'leaf',
      label: 'Run',
      hint: 'One-shot task',
      action: async (args) => { const m = await import('./run.js'); await m.run(args); },
    },
    {
      key: 'config',
      kind: 'group',
      label: 'Config',
      children: [
        {
          key: 'llm',
          kind: 'group',
          label: 'LLM',
          children: [
            {
              key: 'show',
              kind: 'leaf',
              label: 'Show',
              hint: 'Display current LLM config',
              action: async () => { const m = await import('./config/llm.js'); await m.show(); },
            },
            {
              key: 'edit',
              kind: 'leaf',
              label: 'Edit',
              hint: 'Change provider, model, API key',
              action: async () => { const m = await import('./config/llm.js'); await m.edit(); },
            },
          ],
        },
        {
          key: 'channel',
          kind: 'group',
          label: 'Channel',
          children: [
            {
              key: 'show',
              kind: 'leaf',
              label: 'Show',
              hint: 'Display channel config',
              action: async () => { const m = await import('./config/channel.js'); await m.show(); },
            },
            {
              key: 'edit',
              kind: 'leaf',
              label: 'Edit',
              hint: 'Configure channels',
              action: async () => { const m = await import('./config/channel.js'); await m.edit(); },
            },
          ],
        },
        {
          key: 'context',
          kind: 'group',
          label: 'Context',
          children: [
            {
              key: 'show',
              kind: 'leaf',
              label: 'Show',
              hint: 'Display context files',
              action: async () => { const m = await import('./config/context.js'); await m.show(); },
            },
            {
              key: 'edit',
              kind: 'leaf',
              label: 'Edit',
              hint: 'Edit context files',
              action: async () => { const m = await import('./config/context.js'); await m.edit(); },
            },
          ],
        },
        {
          key: 'compaction',
          kind: 'group',
          label: 'Compaction',
          children: [
            {
              key: 'show',
              kind: 'leaf',
              label: 'Show',
              hint: 'Display compaction config',
              action: async () => { const m = await import('./config/compaction.js'); await m.show(); },
            },
            {
              key: 'edit',
              kind: 'leaf',
              label: 'Edit',
              hint: 'Configure context pruning & safeguard',
              action: async () => { const m = await import('./config/compaction.js'); await m.edit(); },
            },
          ],
        },
        {
          key: 'heartbeat',
          kind: 'group',
          label: 'Heartbeat',
          children: [
            {
              key: 'show',
              kind: 'leaf',
              label: 'Show',
              hint: 'Display heartbeat config',
              action: async () => { const m = await import('./config/heartbeat.js'); await m.show(); },
            },
            {
              key: 'edit',
              kind: 'leaf',
              label: 'Edit',
              hint: 'Configure heartbeat schedule',
              action: async () => { const m = await import('./config/heartbeat.js'); await m.edit(); },
            },
            {
              key: 'tasks',
              kind: 'leaf',
              label: 'Tasks',
              hint: 'Edit HEARTBEAT.md in $EDITOR',
              action: async () => { const m = await import('./config/heartbeat.js'); await m.tasks(); },
            },
          ],
        },
      ],
    },
    {
      key: 'gateway',
      kind: 'group',
      label: 'Gateway',
      children: [
        {
          key: 'start',
          kind: 'leaf',
          label: 'Start',
          hint: 'Start gateway + all services',
          action: async () => { const m = await import('./gateway/start.js'); await m.start(); },
        },
        {
          key: 'stop',
          kind: 'leaf',
          label: 'Stop',
          hint: 'Stop running gateway',
          action: async () => { const m = await import('./gateway/stop.js'); await m.stop(); },
        },
        {
          key: 'restart',
          kind: 'leaf',
          label: 'Restart',
          hint: 'Restart running gateway',
          action: async () => { const m = await import('./gateway/restart.js'); await m.restart(); },
        },
        {
          key: 'status',
          kind: 'leaf',
          label: 'Status',
          hint: 'Gateway process status',
          action: async () => { const m = await import('./gateway/status.js'); await m.status(); },
        },
        {
          key: 'inspect',
          kind: 'leaf',
          label: 'Inspect',
          hint: 'Show registered services, methods, events, tools',
          action: async () => { const m = await import('./debug.js'); await m.inspect(); },
        },
      ],
    },
    {
      key: 'cron',
      kind: 'group',
      label: 'Cron',
      children: [
        {
          key: 'list',
          kind: 'leaf',
          label: 'List',
          hint: 'Show scheduled tasks',
          action: async () => { const m = await import('./cron.js'); await m.list(); },
        },
        {
          key: 'add',
          kind: 'leaf',
          label: 'Add',
          hint: 'Add a scheduled task',
          action: async () => { const m = await import('./cron.js'); await m.add(); },
        },
        {
          key: 'remove',
          kind: 'leaf',
          label: 'Remove',
          hint: 'Remove a scheduled task',
          hidden: true,
          action: async (args) => { const m = await import('./cron.js'); await m.remove(args); },
        },
        {
          key: 'trigger',
          kind: 'leaf',
          label: 'Trigger',
          hint: 'Manually trigger a task',
          hidden: true,
          action: async (args) => { const m = await import('./cron.js'); await m.trigger(args); },
        },
        {
          key: 'logs',
          kind: 'leaf',
          label: 'Logs',
          hint: 'View past cron executions',
          action: async (args) => { const m = await import('./cron.js'); await m.logs(args); },
        },
      ],
    },
{
      key: 'sessions',
      kind: 'group',
      label: 'Sessions',
      children: [
        {
          key: 'list',
          kind: 'leaf',
          label: 'List',
          hint: 'Show all sessions',
          action: async () => { const m = await import('./sessions.js'); await m.list(); },
        },
        {
          key: 'history',
          kind: 'leaf',
          label: 'History',
          hint: 'Show session transcript',
          action: async (args) => { const m = await import('./sessions.js'); await m.history(args); },
        },
      ],
    },
    {
      key: 'health',
      kind: 'leaf',
      label: 'Health',
      hint: 'Check system health',
      action: async () => { const m = await import('./health.js'); await m.health(); },
    },
  ];
}

/** Resolve a CLI path like ['config', 'llm', 'show'] against the tree */
export function resolve(
  nodes: MenuNode[],
  args: string[],
): { node: MenuNode; remaining: string[] } | null {
  if (args.length === 0) return null;

  const [head, ...tail] = args;
  const match = nodes.find((n) => n.key === head);
  if (!match) return null;

  if (isGroup(match) && tail.length > 0) {
    const deeper = resolve(match.children, tail);
    if (deeper) return deeper;
  }

  return { node: match, remaining: tail };
}
