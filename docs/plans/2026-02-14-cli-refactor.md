# CLI Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat commander subcommands with an interactive menu-first CLI where bare `vargos` shows a navigable menu and direct commands mirror the menu tree exactly.

**Architecture:** Single menu tree data structure drives both interactive `@clack/select` menus and commander subcommand routing. All gateway boot logic moves from `src/start.ts` into `src/cli/gateway/start.ts`. Shared config loading in `src/cli/boot.ts`.

**Tech Stack:** TypeScript, `@clack/prompts` (select, intro, outro, log, isCancel), `commander` (nested subcommands, --help, --version), `ws` (gateway connectivity check)

**Design doc:** `docs/plans/2026-02-14-cli-refactor-design.md`

---

### Task 1: Create `src/cli/boot.ts` — shared config loading

**Files:**
- Create: `src/cli/boot.ts`
- Test: manual — used by every subsequent task

**Step 1: Write boot.ts**

Extract the config-load-validate pattern used in `src/start.ts:40-87` and `src/cli/index.ts:52-55` into a shared function.

```typescript
// src/cli/boot.ts
import { resolveDataDir, resolveWorkspaceDir, initPaths } from '../core/config/paths.js';
import { loadConfig, type VargosConfig } from '../core/config/pi-config.js';
import { validateConfig } from '../core/config/validate.js';

export interface BootResult {
  config: VargosConfig;
  dataDir: string;
  workspaceDir: string;
}

export async function loadAndValidate(): Promise<BootResult> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  if (!config) {
    console.error('  No config found. Run: vargos config llm edit');
    process.exit(1);
  }

  initPaths(config.paths);
  const workspaceDir = resolveWorkspaceDir();

  const validation = validateConfig(config);
  for (const w of validation.warnings) console.error(`  ⚠ ${w}`);
  if (!validation.valid) {
    for (const e of validation.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  return { config, dataDir, workspaceDir };
}
```

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/boot.ts
git commit -m "feat(cli): add shared boot.ts for config load + validate"
```

---

### Task 2: Create `src/cli/client.ts` — extract CliClient

**Files:**
- Create: `src/cli/client.ts`
- Source: move from `src/cli/index.ts:22-71`

**Step 1: Write client.ts**

Move `CliClient` class and `connectToGateway()` from `index.ts`. Use `loadAndValidate` from boot.ts for config resolution.

```typescript
// src/cli/client.ts
import chalk from 'chalk';
import { ServiceClient } from '../services/client.js';
import { loadAndValidate } from './boot.js';

export class CliClient extends ServiceClient {
  private deltaHandler?: (delta: string) => void;

  constructor(gatewayUrl: string) {
    super({
      service: 'cli',
      methods: [],
      events: [],
      subscriptions: ['run.delta', 'run.completed'],
      gatewayUrl,
    });
  }

  async handleMethod(): Promise<unknown> {
    throw new Error('CLI handles no methods');
  }

  handleEvent(event: string, payload: unknown): void {
    if (event === 'run.delta' && this.deltaHandler) {
      const { delta } = payload as { delta: string };
      this.deltaHandler(delta);
    }
  }

  onDelta(handler: (delta: string) => void): void {
    this.deltaHandler = handler;
  }
}

export async function connectToGateway(): Promise<CliClient> {
  const { config } = await loadAndValidate();

  const host = config.gateway?.host ?? '127.0.0.1';
  const port = config.gateway?.port ?? 9000;
  const gatewayUrl = `ws://${host}:${port}`;
  const client = new CliClient(gatewayUrl);

  try {
    await client.connect();
  } catch {
    console.error(chalk.red('\n  Cannot connect to Vargos gateway.'));
    console.error(chalk.gray('  Start the server first: vargos gateway start\n'));
    process.exit(1);
  }

  return client;
}
```

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/client.ts
git commit -m "feat(cli): extract CliClient + connectToGateway to client.ts"
```

---

### Task 3: Create `src/cli/tree.ts` — menu tree definition

**Files:**
- Create: `src/cli/tree.ts`

**Step 1: Write tree types and structure**

Define the menu tree data structure and the full tree. Actions will be wired as lazy imports to avoid loading everything upfront.

```typescript
// src/cli/tree.ts

export interface MenuGroup {
  label: string;
  description?: string;
  children: MenuNode[];
}

export interface MenuLeaf {
  label: string;
  description: string;
  args?: string;
  action: (args?: string[]) => Promise<void>;
}

export type MenuNode = MenuGroup | MenuLeaf;

export function isGroup(node: MenuNode): node is MenuGroup {
  return 'children' in node;
}

export function buildTree(): MenuNode[] {
  return [
    {
      label: 'config',
      description: 'Configuration management',
      children: [
        {
          label: 'llm',
          description: 'LLM provider settings',
          children: [
            { label: 'show', description: 'Show current LLM config', action: lazy(() => import('./config/llm.js'), 'show') },
            { label: 'edit', description: 'Edit LLM config', action: lazy(() => import('./config/llm.js'), 'edit') },
          ],
        },
        {
          label: 'channel',
          description: 'Channel settings',
          children: [
            { label: 'show', description: 'Show channel config', action: lazy(() => import('./config/channel.js'), 'show') },
            { label: 'edit', description: 'Edit channel config', action: lazy(() => import('./config/channel.js'), 'edit') },
          ],
        },
        {
          label: 'context',
          description: 'Agent context files',
          children: [
            { label: 'show', description: 'Show context files', action: lazy(() => import('./config/context.js'), 'show') },
            { label: 'edit', description: 'Edit a context file', action: lazy(() => import('./config/context.js'), 'edit') },
          ],
        },
      ],
    },
    {
      label: 'gateway',
      description: 'Gateway lifecycle',
      children: [
        { label: 'start', description: 'Start gateway + all services', action: lazy(() => import('./gateway/start.js'), 'start') },
        { label: 'stop', description: 'Stop the running gateway', action: lazy(() => import('./gateway/stop.js'), 'stop') },
        { label: 'restart', description: 'Restart the gateway', action: lazy(() => import('./gateway/restart.js'), 'restart') },
        { label: 'status', description: 'Show gateway status', action: lazy(() => import('./gateway/status.js'), 'status') },
      ],
    },
    { label: 'chat', description: 'Interactive chat session', action: lazy(() => import('./chat.js'), 'chat') },
    { label: 'run', description: 'Run a single task', args: '<task>', action: lazy(() => import('./run.js'), 'run') },
    { label: 'health', description: 'Check config and connectivity', action: lazy(() => import('./health.js'), 'health') },
  ];
}

/** Lazy-load a module and call a named export */
function lazy(
  loader: () => Promise<Record<string, unknown>>,
  fn: string,
): (args?: string[]) => Promise<void> {
  return async (args) => {
    const mod = await loader();
    await (mod[fn] as (args?: string[]) => Promise<void>)(args);
  };
}

/**
 * Resolve argv segments against the tree.
 * Returns { node, remaining } or null if no match.
 */
export function resolve(
  tree: MenuNode[],
  segments: string[],
): { node: MenuNode; remaining: string[] } | null {
  if (segments.length === 0) return null;

  const [head, ...tail] = segments;
  const match = tree.find((n) => n.label === head);
  if (!match) return null;

  if (isGroup(match) && tail.length > 0) {
    return resolve(match.children, tail) ?? { node: match, remaining: tail };
  }

  return { node: match, remaining: tail };
}
```

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: errors about missing action modules (config/llm.js, etc.) — expected, we'll create them next

**Step 3: Commit**

```bash
git add src/cli/tree.ts
git commit -m "feat(cli): add menu tree definition with lazy-loaded actions"
```

---

### Task 4: Create `src/cli/menu.ts` — interactive menu walker

**Files:**
- Create: `src/cli/menu.ts`

**Step 1: Write menu.ts**

Recursive menu walker using `@clack/prompts`. Groups show children + Back, leaves run their action, then return to parent.

```typescript
// src/cli/menu.ts
import * as p from '@clack/prompts';
import { type MenuNode, isGroup } from './tree.js';

const BACK = Symbol('back');

export async function runMenu(nodes: MenuNode[]): Promise<void> {
  while (true) {
    const options = nodes.map((n) => ({
      value: n,
      label: n.label.charAt(0).toUpperCase() + n.label.slice(1),
      hint: isGroup(n) ? '' : (n as any).description,
    }));

    const selected = await p.select({
      message: 'What would you like to do?',
      options: [...options, { value: BACK, label: 'Exit' }],
    });

    if (p.isCancel(selected) || selected === BACK) return;

    const node = selected as MenuNode;

    if (isGroup(node)) {
      await runSubmenu(node);
    } else {
      await (node as any).action();
    }
  }
}

async function runSubmenu(group: MenuNode & { children: MenuNode[] }): Promise<void> {
  while (true) {
    const options = group.children.map((n) => ({
      value: n,
      label: n.label.charAt(0).toUpperCase() + n.label.slice(1),
      hint: isGroup(n) ? '' : (n as any).description,
    }));

    const selected = await p.select({
      message: group.label.charAt(0).toUpperCase() + group.label.slice(1),
      options: [...options, { value: BACK, label: '← Back' }],
    });

    if (p.isCancel(selected) || selected === BACK) return;

    const node = selected as MenuNode;

    if (isGroup(node)) {
      await runSubmenu(node);
    } else {
      await (node as any).action();
    }
  }
}
```

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/menu.ts
git commit -m "feat(cli): add interactive menu walker using @clack/prompts"
```

---

### Task 5: Create action stubs — all leaf files

Create every action file with minimal stubs so the tree compiles. We'll fill in real implementations in subsequent tasks.

**Files:**
- Create: `src/cli/config/llm.ts`
- Create: `src/cli/config/channel.ts`
- Create: `src/cli/config/context.ts`
- Create: `src/cli/gateway/start.ts` (overwrite existing)
- Create: `src/cli/gateway/stop.ts`
- Create: `src/cli/gateway/restart.ts`
- Create: `src/cli/gateway/status.ts`
- Create: `src/cli/chat.ts`
- Create: `src/cli/run.ts`
- Create: `src/cli/health.ts`

**Step 1: Write all stub files**

Each exports the named function matching tree.ts. Stubs just print "not implemented yet" so we can verify the wiring end-to-end before filling in real logic.

Example pattern:
```typescript
// src/cli/config/llm.ts
export async function show(): Promise<void> { console.log('config llm show: not implemented'); }
export async function edit(): Promise<void> { console.log('config llm edit: not implemented'); }
```

Same pattern for all files: `channel.ts` (show/edit), `context.ts` (show/edit), `gateway/start.ts` (start), `gateway/stop.ts` (stop), `gateway/restart.ts` (restart), `gateway/status.ts` (status), `chat.ts` (chat), `run.ts` (run — takes args), `health.ts` (health).

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS — all tree.ts imports should resolve

**Step 3: Commit**

```bash
git add src/cli/config/ src/cli/gateway/ src/cli/chat.ts src/cli/run.ts src/cli/health.ts
git commit -m "feat(cli): add action stubs for all menu leaves"
```

---

### Task 6: Rewrite `src/cli/index.ts` — new entry point

**Files:**
- Modify: `src/cli/index.ts` (full rewrite)
- Delete: `src/cli/commands/` (entire directory)

**Step 1: Rewrite index.ts**

The new entry point: if argv has subcommand segments, resolve against the tree and run the action. Otherwise show interactive menu.

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { buildTree, resolve, isGroup, type MenuNode, type MenuLeaf } from './tree.js';
import { runMenu } from './menu.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

const tree = buildTree();

// If no args beyond the binary path, show interactive menu
const userArgs = process.argv.slice(2);
if (userArgs.length === 0 || (userArgs.length === 1 && (userArgs[0] === '-V' || userArgs[0] === '--version'))) {
  if (userArgs[0] === '-V' || userArgs[0] === '--version') {
    console.log(VERSION);
    process.exit(0);
  }
  runMenu(tree).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (userArgs[0] === '-h' || userArgs[0] === '--help' || userArgs[0] === 'help') {
  printHelp(tree);
} else {
  // Resolve argv against the tree
  const result = resolve(tree, userArgs);
  if (!result) {
    console.error(`Unknown command: ${userArgs.join(' ')}`);
    console.error('Run: vargos --help');
    process.exit(1);
  }

  const { node, remaining } = result;
  if (isGroup(node)) {
    console.error(`"${userArgs.join(' ')}" is a group. Subcommands:`);
    for (const child of node.children) {
      const desc = isGroup(child) ? '...' : (child as MenuLeaf).description;
      console.error(`  ${child.label}  ${desc}`);
    }
    process.exit(1);
  }

  (node as MenuLeaf).action(remaining).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

function printHelp(nodes: MenuNode[], prefix = 'vargos') {
  console.log(`\nUsage: ${prefix} [command]\n`);
  console.log(`Vargos CLI v${VERSION}\n`);
  console.log('Commands:');
  for (const n of nodes) {
    if (isGroup(n)) {
      console.log(`  ${n.label}  ${n.description ?? ''}`);
    } else {
      const leaf = n as MenuLeaf;
      const args = leaf.args ? ` ${leaf.args}` : '';
      console.log(`  ${leaf.label}${args}  ${leaf.description}`);
    }
  }
  console.log('');
}
```

**Step 2: Delete old commands directory**

Remove `src/cli/commands/` entirely. Also remove `src/cli/README.md` if present.

**Step 3: Verify typecheck + test**

Run: `pnpm run typecheck && pnpm run test:run`
Expected: PASS

**Step 4: Build and test binary**

Run: `pnpm build && vargos --version && vargos --help`
Expected: version output + help listing

**Step 5: Commit**

```bash
git add src/cli/index.ts
git rm -r src/cli/commands/
git commit -m "feat(cli): rewrite entry point with tree-based routing + interactive menu"
```

---

### Task 7: Implement `src/cli/config/llm.ts` — show + edit

**Files:**
- Modify: `src/cli/config/llm.ts` (replace stub)
- Source logic: `src/cli/commands/config.ts` (config:get agent section) + `src/core/config/onboard.ts` (interactivePiConfig)

**Step 1: Implement show + edit**

`show()` — display current LLM config (provider, model, apiKey status, baseUrl). Reuse display logic from old `config.ts:32-38`.

`edit()` — run the interactive LLM config wizard. Reuse `interactivePiConfig` from `src/core/config/onboard.ts` but only the agent section (not advanced settings — those are now in config.json directly).

```typescript
// src/cli/config/llm.ts
import chalk from 'chalk';
import { loadAndValidate } from '../boot.js';
import { resolveDataDir } from '../../core/config/paths.js';
import { interactivePiConfig } from '../../core/config/onboard.js';
import { loadConfig } from '../../core/config/pi-config.js';

export async function show(): Promise<void> {
  const config = await loadConfig(resolveDataDir());
  if (!config) {
    console.log('  Not configured. Run: vargos config llm edit');
    return;
  }
  const { agent } = config;
  console.log('');
  console.log(chalk.blue('  LLM Configuration'));
  console.log(`    Provider: ${agent.provider}`);
  console.log(`    Model:    ${agent.model}`);
  if (agent.baseUrl) console.log(`    Base URL: ${agent.baseUrl}`);
  const envKey = process.env[`${agent.provider.toUpperCase()}_API_KEY`];
  const hasKey = !!(envKey || agent.apiKey);
  console.log(`    API Key:  ${hasKey ? chalk.green('ok') : chalk.gray('not set')}${envKey ? ' (env)' : ''}`);
  console.log('');
}

export async function edit(): Promise<void> {
  await interactivePiConfig(resolveDataDir());
}
```

**Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Build and test**

Run: `pnpm build && vargos config llm show`
Expected: Shows current LLM config or "not configured"

**Step 4: Commit**

```bash
git add src/cli/config/llm.ts
git commit -m "feat(cli): implement config llm show + edit"
```

---

### Task 8: Implement `src/cli/config/channel.ts` — show + edit

**Files:**
- Modify: `src/cli/config/channel.ts` (replace stub)
- Source logic: `src/core/channels/onboard.ts` (viewChannels, runOnboarding)

**Step 1: Implement show + edit**

`show()` — list channels from config with status. Reuse display from old `config.ts:58-65`.

`edit()` — run channel onboarding wizard from `src/core/channels/onboard.ts`.

```typescript
// src/cli/config/channel.ts
import chalk from 'chalk';
import { resolveDataDir } from '../../core/config/paths.js';
import { loadConfig } from '../../core/config/pi-config.js';

export async function show(): Promise<void> {
  const config = await loadConfig(resolveDataDir());
  if (!config?.channels || Object.keys(config.channels).length === 0) {
    console.log('  No channels configured. Run: vargos config channel edit');
    return;
  }
  console.log('');
  console.log(chalk.blue('  Channels'));
  for (const [type, ch] of Object.entries(config.channels)) {
    const status = ch.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled');
    console.log(`    ${type}: ${status}`);
  }
  console.log('');
}

export async function edit(): Promise<void> {
  const { runOnboarding } = await import('../../core/channels/onboard.js');
  await runOnboarding();
}
```

**Step 2: Verify typecheck + build**

Run: `pnpm run typecheck && pnpm build && vargos config channel show`

**Step 3: Commit**

```bash
git add src/cli/config/channel.ts
git commit -m "feat(cli): implement config channel show + edit"
```

---

### Task 9: Implement `src/cli/config/context.ts` — show + edit

**Files:**
- Modify: `src/cli/config/context.ts` (replace stub)

**Step 1: Implement show + edit**

`show()` — list context files from `CONTEXT_FILE_NAMES`, show which exist and first line of content.

`edit()` — `@clack/select` to pick a file, then `$EDITOR` (or fallback to `vi`/`nano`) to open it.

```typescript
// src/cli/config/context.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { resolveWorkspaceDir } from '../../core/config/paths.js';
import { CONTEXT_FILE_NAMES } from '../../core/config/workspace.js';
import { loadAndValidate } from '../boot.js';

export async function show(): Promise<void> {
  await loadAndValidate();
  const wsDir = resolveWorkspaceDir();

  console.log('');
  console.log(chalk.blue('  Context Files'));
  for (const name of CONTEXT_FILE_NAMES) {
    const filePath = path.join(wsDir, name);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const firstLine = content.split('\n').find((l) => l.trim())?.trim() ?? '';
      console.log(`    ${chalk.green('✓')} ${name}  ${chalk.gray(firstLine.slice(0, 60))}`);
    } catch {
      console.log(`    ${chalk.gray('○')} ${name}  ${chalk.gray('(missing)')}`);
    }
  }
  console.log(`\n    ${chalk.gray(`Path: ${wsDir}`)}\n`);
}

export async function edit(): Promise<void> {
  await loadAndValidate();
  const wsDir = resolveWorkspaceDir();

  const options = CONTEXT_FILE_NAMES.map((name) => ({ value: name, label: name }));
  const selected = await p.select({ message: 'Which file to edit?', options });
  if (p.isCancel(selected)) return;

  const filePath = path.join(wsDir, selected as string);
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

  try {
    execSync(`${editor} "${filePath}"`, { stdio: 'inherit' });
  } catch {
    console.error(`  Failed to open ${editor}. Set $EDITOR env var.`);
  }
}
```

**Step 2: Verify typecheck + build + test**

Run: `pnpm run typecheck && pnpm build && vargos config context show`

**Step 3: Commit**

```bash
git add src/cli/config/context.ts
git commit -m "feat(cli): implement config context show + edit"
```

---

### Task 10: Implement `src/cli/gateway/start.ts` — absorb src/start.ts

**Files:**
- Modify: `src/cli/gateway/start.ts` (replace stub)
- Delete: `src/start.ts`
- Modify: `package.json` (update scripts)

**Step 1: Move gateway boot logic**

Copy the full `main()` function from `src/start.ts` into `cli/gateway/start.ts` as the `start()` export. The function does: PID lock, config load (with onboard wizard for first run), workspace init, service boot, signal handlers.

The key change: use `loadAndValidate()` from boot.ts where possible, but keep the full boot flow (PID lock, workspace init, identity check, onboard wizard for first run) since gateway start needs all of it.

Reference: `src/start.ts` lines 38-266 (the entire `main()` function + PID lock helpers).

**Step 2: Delete src/start.ts**

**Step 3: Update package.json scripts**

```json
"start": "tsx src/cli/index.ts gateway start",
"cli": "tsx src/cli/index.ts",
"chat": "tsx src/cli/index.ts chat",
```

**Step 4: Verify typecheck + test**

Run: `pnpm run typecheck && pnpm run test:run`
Expected: PASS

**Step 5: Build and test**

Run: `pnpm build && vargos gateway start` (then Ctrl+C to stop)

**Step 6: Commit**

```bash
git rm src/start.ts
git add src/cli/gateway/start.ts package.json
git commit -m "feat(cli): move gateway boot to cli/gateway/start.ts, delete src/start.ts"
```

---

### Task 11: Implement `src/cli/gateway/stop.ts` + `restart.ts` + `status.ts`

**Files:**
- Modify: `src/cli/gateway/stop.ts` (replace stub)
- Modify: `src/cli/gateway/restart.ts` (replace stub)
- Create: `src/cli/gateway/status.ts` (replace stub)

**Step 1: Move PID helpers**

Move `readGatewayPid` and `waitForExit` from old `src/cli/index.ts` into a shared location. Put them in `src/cli/gateway/stop.ts` since they're primarily about stopping, and re-export from restart.

Actually cleaner: put PID helpers in `src/cli/client.ts` (or a small `src/cli/pid.ts`). They're used by stop, restart, and status. Use a small `pid.ts`:

```typescript
// src/cli/pid.ts
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveDataDir } from '../core/config/paths.js';

export async function readGatewayPid(): Promise<number | null> {
  try {
    const pidFile = path.join(resolveDataDir(), 'vargos.pid');
    const pid = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

export function waitForExit(pid: number, timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      try {
        process.kill(pid, 0);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(check, 100);
      } catch { resolve(true); }
    };
    check();
  });
}
```

**Step 2: Implement stop.ts**

Source: `src/cli/commands/stop.ts` (lines 1-27). Same logic, just export `stop()` instead of `register(program)`.

**Step 3: Implement restart.ts**

Source: `src/cli/commands/restart.ts` (lines 1-35). Same logic, export `restart()`.

**Step 4: Implement status.ts**

New functionality. Show PID, check if process is alive, try connecting to gateway to get service list.

```typescript
// src/cli/gateway/status.ts
import chalk from 'chalk';
import { readGatewayPid } from '../pid.js';
import { resolveDataDir } from '../../core/config/paths.js';
import { loadConfig } from '../../core/config/pi-config.js';
import { WebSocket } from 'ws';

export async function status(): Promise<void> {
  const pid = await readGatewayPid();
  console.log('');
  console.log(chalk.blue('  Gateway Status'));

  if (!pid) {
    console.log(`    ${chalk.red('✗')} Not running`);
    console.log('');
    return;
  }

  console.log(`    ${chalk.green('✓')} Running (PID: ${pid})`);

  // Try to get service count via WS handshake
  const config = await loadConfig(resolveDataDir());
  const host = config?.gateway?.host ?? '127.0.0.1';
  const port = config?.gateway?.port ?? 9000;
  const url = `ws://${host}:${port}`;

  try {
    const services = await probeGateway(url);
    console.log(`    ${chalk.green('✓')} Listening at ${url}`);
    if (services.length > 0) {
      console.log(`    ${chalk.green('✓')} ${services.length} services: ${services.join(', ')}`);
    }
  } catch {
    console.log(`    ${chalk.yellow('⚠')} PID exists but gateway not reachable at ${url}`);
  }
  console.log('');
}

function probeGateway(url: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 3000);

    ws.on('open', () => {
      // Register as a probe, read the routing table from the response
      const frame = JSON.stringify({
        type: 'req', id: 'probe-1', method: 'gateway.register',
        params: { service: 'probe', methods: [], events: [], subscriptions: [] },
      });
      ws.send(frame);
    });

    ws.on('message', (raw) => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(raw.toString());
        if (data.ok && data.payload) {
          const services = Object.keys(data.payload.services ?? data.payload);
          ws.close();
          resolve(services);
        } else {
          ws.close();
          resolve([]);
        }
      } catch { ws.close(); resolve([]); }
    });

    ws.on('error', () => { clearTimeout(timer); reject(new Error('connect failed')); });
  });
}
```

**Step 5: Verify typecheck + test**

Run: `pnpm run typecheck && pnpm run test:run`

**Step 6: Commit**

```bash
git add src/cli/pid.ts src/cli/gateway/stop.ts src/cli/gateway/restart.ts src/cli/gateway/status.ts
git commit -m "feat(cli): implement gateway stop, restart, status commands"
```

---

### Task 12: Implement `src/cli/chat.ts` + `src/cli/run.ts`

**Files:**
- Modify: `src/cli/chat.ts` (replace stub)
- Modify: `src/cli/run.ts` (replace stub)

**Step 1: Implement chat.ts**

Source: `src/cli/commands/chat.ts`. Same logic, export `chat()`. Import `connectToGateway` from `./client.js`.

**Step 2: Implement run.ts**

Source: `src/cli/commands/run.ts`. Same logic, export `run(args)`. The `args` array comes from tree.ts resolve — first element is the task string.

```typescript
// src/cli/run.ts
import chalk from 'chalk';
import { connectToGateway } from './client.js';

export async function run(args?: string[]): Promise<void> {
  const task = args?.[0];
  if (!task) {
    console.error('  Usage: vargos run <task>');
    process.exit(1);
  }
  // ... same logic as old run.ts
}
```

**Step 3: Verify typecheck + build**

Run: `pnpm run typecheck && pnpm build`

**Step 4: Commit**

```bash
git add src/cli/chat.ts src/cli/run.ts
git commit -m "feat(cli): implement chat + run commands"
```

---

### Task 13: Implement `src/cli/health.ts`

**Files:**
- Modify: `src/cli/health.ts` (replace stub)

**Step 1: Implement health check**

Config validation (always) + gateway connectivity (if reachable).

```typescript
// src/cli/health.ts
import chalk from 'chalk';
import { resolveDataDir } from '../core/config/paths.js';
import { loadConfig } from '../core/config/pi-config.js';
import { validateConfig } from '../core/config/validate.js';
import { initPaths } from '../core/config/paths.js';
import { WebSocket } from 'ws';

export async function health(): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  console.log('');
  console.log(chalk.blue('  Health Check'));
  console.log('');
  console.log('  Config');

  if (!config) {
    console.log(`    ${chalk.red('✗')} config.json not found`);
    console.log('');
    return;
  }

  console.log(`    ${chalk.green('✓')} config.json found`);
  console.log(`    ${chalk.green('✓')} agent: ${config.agent.provider} / ${config.agent.model}`);

  const envKey = process.env[`${config.agent.provider.toUpperCase()}_API_KEY`];
  const hasKey = !!(envKey || config.agent.apiKey);
  console.log(`    ${hasKey ? chalk.green('✓') : chalk.red('✗')} API key ${hasKey ? 'present' : 'missing'}`);

  initPaths(config.paths);
  const validation = validateConfig(config);
  for (const e of validation.errors) console.log(`    ${chalk.red('✗')} ${e}`);
  for (const w of validation.warnings) console.log(`    ${chalk.yellow('⚠')} ${w}`);

  // Gateway connectivity
  const host = config.gateway?.host ?? '127.0.0.1';
  const port = config.gateway?.port ?? 9000;
  const url = `ws://${host}:${port}`;

  console.log('');
  console.log('  Gateway');

  try {
    await pingGateway(url);
    console.log(`    ${chalk.green('✓')} Reachable at ${url}`);
  } catch {
    console.log(`    ${chalk.red('✗')} Cannot connect to ${url}`);
  }
  console.log('');
}

function pingGateway(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 3000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(); });
    ws.on('error', () => { clearTimeout(timer); reject(new Error('connect failed')); });
  });
}
```

**Step 2: Verify typecheck + build**

Run: `pnpm run typecheck && pnpm build && vargos health`

**Step 3: Commit**

```bash
git add src/cli/health.ts
git commit -m "feat(cli): implement health check command"
```

---

### Task 14: Update docs and clean up

**Files:**
- Modify: `CLAUDE.md` — update structure section, CLI commands, entry points
- Delete: `src/core/config/onboard.ts` — only if `interactivePiConfig` was fully moved (check: `llm.ts edit` still imports it, so keep it for now; just remove the advanced settings section since that's in config.json)
- Delete: `src/cli/README.md` if it exists

**Step 1: Update CLAUDE.md**

Update the Structure section to reflect new `cli/` layout. Update Development Commands:

```
pnpm start            → vargos gateway start
pnpm cli chat         → vargos chat
pnpm cli run "task"   → vargos run "task"
pnpm cli config       → vargos config llm edit
```

Update entry points:
```
- src/cli/index.ts — Single entry point (interactive menu or direct commands)
- src/cli/gateway/start.ts — Gateway + all services boot
```

**Step 2: Final verification**

Run: `pnpm run typecheck && pnpm run test:run && pnpm build`
Run: `vargos --help`, `vargos --version`, `vargos health`

**Step 3: Commit**

```bash
git add CLAUDE.md
git rm src/cli/README.md  # if exists
git commit -m "docs: update CLAUDE.md for new CLI structure"
```

---

### Task 15: End-to-end integration test

**Files:**
- No new files — manual verification

**Step 1: Test interactive menu**

Run: `vargos` (bare)
Expected: @clack select menu with Config, Gateway, Chat, Run, Health, Exit

**Step 2: Test direct commands**

Run each:
- `vargos --version` → version number
- `vargos --help` → command listing
- `vargos config llm show` → LLM config display
- `vargos config context show` → context file listing
- `vargos health` → config + connectivity check
- `vargos gateway status` → PID + service status

**Step 3: Test menu navigation**

- `vargos` → Config → LLM → Show → Back → Back → Exit
- `vargos` → Gateway → Status → Back → Exit
- `vargos` → Ctrl+C at any point → clean exit

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete interactive menu-first CLI refactor"
```
