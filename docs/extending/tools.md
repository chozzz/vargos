# Building Custom Tools

Tools are the capabilities Vargos agents can invoke—reading files, calling APIs, running code, searching memory, etc.

## Tool Anatomy

Every tool has:

```typescript
interface Tool {
  name: string;                    // Unique identifier
  description: string;             // What it does (shown to agent)
  parameters: z.ZodSchema;        // Input validation schema
  execute(args, context): Promise<ToolResult>;  // Implementation
}
```

## Registering a Tool

Tools are registered via the `@register` decorator in a service:

```typescript
import { z } from 'zod';
import { Bus } from './gateway/types';

export class MyService {
  @register('my.readFile', {
    description: 'Read a file from disk',
    schema: z.object({
      path: z.string().describe('Path to file'),
      maxLines: z.number().optional().describe('Max lines to read')
    })
  })
  async readFile(args: { path: string; maxLines?: number }): Promise<ToolResult> {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      const lines = content.split('\n');
      const limited = args.maxLines ? lines.slice(0, args.maxLines) : lines;
      
      return {
        content: [{ type: 'text', text: limited.join('\n') }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
}
```

When this service boots, the tool becomes available to agents immediately.

## Tool Result Format

Tools return a standardized result:

```typescript
interface ToolResult {
  content: ToolContent[];          // Text, images, documents
  isError?: boolean;               // Mark failures
  metadata?: Record<string, unknown>;  // Extra data
}

type ToolContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'document'; text: string; mimeType: string };
```

### Examples

**Text result:**
```typescript
return {
  content: [{ type: 'text', text: 'The answer is 42' }]
};
```

**Image result:**
```typescript
return {
  content: [{
    type: 'image',
    data: base64EncodedImage,
    mimeType: 'image/png'
  }]
};
```

**Error result:**
```typescript
return {
  content: [{ type: 'text', text: 'API rate limited' }],
  isError: true,
  metadata: { retryAfter: 60 }
};
```

## Tool Context

Tools receive a context object with access to other services:

```typescript
async readFile(
  args: { path: string },
  context: ToolContext
): Promise<ToolResult> {
  // Access other tools
  const config = await context.call('config.get', {});
  
  // Log structured data
  context.log('my-service', 'info', 'Reading file', { path: args.path });
  
  // Search workspace
  const results = await context.call('memory.search', {
    query: 'similar files',
    maxResults: 5
  });
  
  return { ... };
}
```

## Parameter Validation

Schemas are Zod validators. Agents see `.describe()` strings as tool help text:

```typescript
@register('web.fetch', {
  description: 'Fetch a URL and extract text',
  schema: z.object({
    url: z.string().url().describe('HTTP(S) URL to fetch'),
    maxChars: z.number().int().positive().optional().describe('Max characters to return'),
    timeout: z.number().int().min(1000).optional().describe('Request timeout in ms')
  })
})
async fetch(args): Promise<ToolResult> { ... }
```

Agents will see:
```
Tool: web.fetch
Fetch a URL and extract text

Parameters:
- url (string): HTTP(S) URL to fetch [REQUIRED]
- maxChars (number): Max characters to return [OPTIONAL]
- timeout (number): Request timeout in ms [OPTIONAL]
```

## Error Handling

Tools should handle errors gracefully:

```typescript
async search(args: { query: string }): Promise<ToolResult> {
  try {
    const results = await db.search(args.query);
    return {
      content: [{ 
        type: 'text', 
        text: `Found ${results.length} results:\n${results.join('\n')}` 
      }]
    };
  } catch (err) {
    if (err.code === 'TIMEOUT') {
      return {
        content: [{ type: 'text', text: 'Search timed out. Try a simpler query.' }],
        isError: true,
        metadata: { retryable: true }
      };
    }
    
    return {
      content: [{ type: 'text', text: `Search failed: ${err.message}` }],
      isError: true
    };
  }
}
```

## Testing Tools

Test tools with a mock context:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('readFile tool', () => {
  it('reads file content', async () => {
    const mockContext = {
      call: vi.fn(),
      log: vi.fn()
    };

    const svc = new MyService(mockBus);
    const result = await svc.readFile(
      { path: '/test/file.txt' },
      mockContext
    );

    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBeUndefined();
  });

  it('returns error for missing file', async () => {
    const mockContext = { call: vi.fn(), log: vi.fn() };
    
    const result = await svc.readFile(
      { path: '/nonexistent.txt' },
      mockContext
    );

    expect(result.isError).toBe(true);
  });
});
```

## Best Practices

1. **One tool = one responsibility** — "read file", not "read or write file"
2. **Validate inputs** — Zod schema handles parsing, your code handles logic
3. **Return structured data** — agents need clear signal about success/failure
4. **Document parameters** — `.describe()` strings are the agent's only help
5. **Handle timeouts** — external APIs are unpredictable
6. **Log important operations** — helps debugging when agents misuse tools
7. **Graceful degradation** — if a tool fails, return error text, not exception

---

## See Also

- [API Reference](../api-reference.md) — Tool result types and schemas
- [Bus Architecture](./architecture/bus-design.md) — How tools integrate with services
- [MCP Integration](./usage/mcp.md) — Expose tools to external applications
