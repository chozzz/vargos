# Vargos MCP Tools

Ported from OpenClaw - Core file and shell tools.

## Ported Tools

### File Operations

#### `read`
Read file contents (text or images).

Parameters:
- `path` (string): Path to the file
- `offset` (number, optional): Line number to start from (1-indexed)
- `limit` (number, optional): Max lines to read

#### `write`
Create or overwrite a file.

Parameters:
- `path` (string): Path to the file
- `content` (string): Content to write

#### `edit`
Surgical text replacement (find and replace exact text).

Parameters:
- `path` (string): Path to the file
- `oldText` (string): Exact text to replace
- `newText` (string): Replacement text

### Shell Execution

#### `exec`
Execute shell commands.

Parameters:
- `command` (string): Shell command to execute
- `timeout` (number, optional): Timeout in milliseconds (default: 60000)

Security:
- Path traversal protection
- Dangerous command blocking (rm -rf /, etc.)
- Timeout enforcement
- Output size limits

## Tests

All tools have comprehensive tests:

```bash
pnpm test
```

## Usage

```typescript
import { toolRegistry } from './mcp/tools/index.js';

// List all tools
const tools = toolRegistry.list();

// Get specific tool
const readTool = toolRegistry.get('read');

// Execute tool
const result = await readTool.execute(
  { path: 'test.txt' },
  { sessionKey: 'abc', workingDir: '/workspace' }
);
```

## Next Tools to Port

From OpenClaw:
- [ ] `web_fetch` - Fetch URLs and extract content
- [ ] `browser_*` - Browser automation
- [ ] `memory_search` / `memory_get` - Memory system
- [ ] `sessions_*` - Session management
- [ ] `process` - Background process management
