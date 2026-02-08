# CLI Refactor Design

## Goal

Replace flat commander subcommands with an interactive menu-first CLI. Bare `vargos` shows a navigable menu. Direct commands (`vargos gateway start`, `vargos config llm show`) still work, mirroring the menu tree exactly.

## Decisions

- **Default UX**: `vargos` with no args = interactive menu
- **Direct commands**: Mirror menu tree (`vargos gateway start`, `vargos chat`, etc.)
- **Prompt library**: `@clack/prompts` (already installed)
- **Context editing**: Opens `$EDITOR` on selected file
- **Health scope**: Config validation + gateway connectivity + connected services
- **Architecture**: Menu-first — single tree definition drives both interactive menu and CLI routing
- **Entry point**: `src/start.ts` deleted, gateway boot moves to `cli/gateway/start.ts`

## Menu Tree

```
vargos
├── Config
│   ├── LLM
│   │   ├── Show
│   │   └── Edit
│   ├── Channel
│   │   ├── Show
│   │   └── Edit
│   └── Context
│       ├── Show          (display CONTEXT_FILE_NAMES content)
│       └── Edit          (select file, open in $EDITOR)
├── Gateway
│   ├── Start
│   ├── Stop
│   ├── Restart
│   └── Status
├── Chat                  (interactive chat session)
├── Run <task>            (one-shot execution)
├── Health                (config + connectivity check)
└── Help
```

CLI commands are all lowercase: `vargos config llm show`, `vargos gateway start`, `vargos health`.

## Directory Structure

```
src/cli/
├── index.ts              # Entry: parse argv OR show interactive menu
├── tree.ts               # Menu tree definition (single source of truth)
├── menu.ts               # Interactive menu walker (@clack/select)
├── client.ts             # CliClient + connectToGateway()
├── boot.ts               # loadAndValidate(): config + paths + validation
├── config/
│   ├── llm.ts            # show() + edit()
│   ├── channel.ts        # show() + edit()
│   └── context.ts        # show() + edit($EDITOR)
├── gateway/
│   ├── start.ts          # Full gateway boot (absorbs src/start.ts)
│   ├── stop.ts           # Stop via PID
│   ├── restart.ts        # Restart via SIGUSR2
│   └── status.ts         # PID, uptime, connected services
├── chat.ts               # Interactive chat
├── run.ts                # One-shot task
└── health.ts             # Config check + gateway connectivity
```

## Tree Data Structure

```typescript
// src/cli/tree.ts

interface MenuGroup {
  label: string;
  children: MenuNode[];
}

interface MenuLeaf {
  label: string;
  description: string;
  args?: string;              // e.g. '<task>' for run
  action: (args?: string[]) => Promise<void>;
}

type MenuNode = MenuGroup | MenuLeaf;

function isGroup(node: MenuNode): node is MenuGroup {
  return 'children' in node;
}
```

The tree imports action functions from each file and wires them together.

## Shared Boot Logic

```typescript
// src/cli/boot.ts

export async function loadAndValidate(): Promise<{
  config: VargosConfig;
  dataDir: string;
  workspaceDir: string;
}>
```

Does: `resolveDataDir()` → `loadConfig()` → `initPaths()` → `validateConfig()` → return or exit.

Used by: `gateway/start.ts`, `health.ts`, `client.ts`, `config/*.ts`.

## Interactive Menu Flow

Bare `vargos` → `menu.ts` walks the tree recursively:
- Group node → `@clack/select` with children + "Back" option
- Leaf node → call `action()`
- After action completes → return to parent menu
- Ctrl+C → exit

## Package.json Changes

```json
{
  "bin": { "vargos": "./dist/cli/index.js" },
  "scripts": {
    "start": "tsx src/cli/index.ts gateway start",
    "cli": "tsx src/cli/index.ts"
  }
}
```

## Deletions

- `src/start.ts` → logic moves to `cli/gateway/start.ts`
- `src/cli/commands/` → entire directory (replaced by new structure)
- `src/core/config/onboard.ts` → logic splits into `cli/config/llm.ts` and `cli/config/channel.ts`

## Health Output

```
Health Check

Config
  ✓ config.json found
  ✓ agent: anthropic / claude-3-5-sonnet
  ✓ API key present

Gateway
  ✓ Reachable at ws://127.0.0.1:9000
  ✓ 5 services connected: agent, tools, sessions, channels, cron
```

If gateway unreachable:
```
Gateway
  ✗ Cannot connect to ws://127.0.0.1:9000
```
