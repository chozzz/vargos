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
