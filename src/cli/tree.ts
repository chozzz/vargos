/** Menu tree — single data structure drives both interactive menus and CLI routing */

export interface MenuGroup {
  kind: 'group';
  key: string;
  label: string;
  hint?: string;
  children: MenuNode[];
}

export interface MenuLeaf {
  kind: 'leaf';
  key: string;
  label: string;
  hint?: string;
  action: (args?: string[]) => Promise<void>;
}

export type MenuNode = MenuGroup | MenuLeaf;

export function isGroup(node: MenuNode): node is MenuGroup {
  return node.kind === 'group';
}

// -- Factories --

function leaf(key: string, hint: string, mod: string, fn: string): MenuNode {
  return {
    key, kind: 'leaf', label: key[0].toUpperCase() + key.slice(1), hint,
    action: async (args) => { const m = await import(mod); await m[fn](args); },
  };
}

function group(key: string, children: MenuNode[]): MenuNode {
  return { key, kind: 'group', label: key[0].toUpperCase() + key.slice(1), children };
}

function configGroup(key: string, showHint: string, editHint: string, extra?: MenuNode[]): MenuNode {
  const mod = `./config/${key}.js`;
  return group(key, [
    leaf('show', showHint, mod, 'show'),
    leaf('edit', editHint, mod, 'edit'),
    ...(extra ?? []),
  ]);
}

// -- Tree --

export function buildTree(): MenuNode[] {
  return [
    leaf('chat', 'Interactive chat session', './chat.js', 'chat'),
    leaf('run', 'One-shot task', './run.js', 'run'),

    group('gateway', [
      leaf('start', 'Start gateway + all services', './gateway/start.js', 'start'),
      leaf('stop', 'Stop running gateway', './gateway/stop.js', 'stop'),
      leaf('restart', 'Restart running gateway', './gateway/restart.js', 'restart'),
      leaf('status', 'Gateway process status', './gateway/status.js', 'status'),
      leaf('inspect', 'Show registered services, methods, events, tools', './debug.js', 'inspect'),
    ]),

    group('sessions', [
      leaf('list', 'Show all sessions', './sessions.js', 'list'),
      leaf('history', 'Show session transcript', './sessions.js', 'history'),
      leaf('debug', 'Show system prompt + processed history', './session-debug.js', 'sessionDebug'),
    ]),

    group('channels', [
      leaf('send', 'Send a message to a channel target', './channels.js', 'send'),
    ]),

    group('cron', [
      leaf('list', 'Show scheduled tasks', './cron.js', 'list'),
      leaf('add', 'Add a scheduled task', './cron.js', 'add'),
      leaf('remove', 'Remove a scheduled task', './cron.js', 'remove'),
      leaf('trigger', 'Manually trigger a task', './cron.js', 'trigger'),
      leaf('logs', 'View past cron executions', './cron.js', 'logs'),
    ]),

    group('webhooks', [
      leaf('list', 'Show configured webhooks', './webhooks.js', 'list'),
      leaf('status', 'Show webhook fire stats', './webhooks.js', 'status'),
    ]),

    group('config', [
      configGroup('llm', 'Display current LLM config', 'Change provider, model, API key'),
      configGroup('channel', 'Display channel config', 'Configure channels'),
      configGroup('context', 'Display context files', 'Edit context files'),
      configGroup('embedding', 'Display embedding config', 'Configure embedding model'),
      configGroup('compaction', 'Display compaction config', 'Configure context pruning & safeguard'),
      configGroup('heartbeat', 'Display heartbeat config', 'Configure heartbeat schedule', [
        leaf('tasks', 'Edit HEARTBEAT.md in $EDITOR', './config/heartbeat.js', 'tasks'),
      ]),
    ]),

    leaf('health', 'Check system health', './health.js', 'health'),
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
