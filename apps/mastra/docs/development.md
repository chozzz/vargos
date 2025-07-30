# Development Guide

How to add new tools, workflows, and agents to Vargos Mastra.

## Adding a New Tool

### 1. Create Tool File

Create `src/mastra/tools/your-tool.tool.ts`:

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getFunctionsService } from '../services/functions.service';

export const yourTool = createTool({
  id: 'your-tool-id' as const,
  description: 'Clear description of what this tool does',

  inputSchema: z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional().describe('Optional parameter'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    error: z.string().optional(),
  }),

  execute: async ({ context }): Promise<{
    success: boolean;
    result: any;
    error?: string;
  }> => {
    const { param1, param2 } = context;

    try {
      // Your logic here
      const service = await getFunctionsService();
      const result = await service.someMethod(param1);

      return {
        success: true,
        result,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        result: null,
        error: errorMessage,
      };
    }
  },
});
```

### 2. Add to Agent

Update `src/mastra/agents/vargos-agent.ts`:

```typescript
import { yourTool } from '../tools/your-tool.tool';

// In createVargosAgent()
tools: {
  // ... existing tools
  [yourTool.id]: yourTool,
}
```

### 3. Test

```bash
# Type check
pnpm build

# Test directly
node -e "
  import { yourTool } from './src/mastra/tools/your-tool.tool.ts';
  const result = await yourTool.execute({
    context: { param1: 'test' }
  });
  console.log(result);
"
```

## Adding a New Workflow

### 1. Create Workflow File

Create `src/mastra/workflows/your-workflow.ts`:

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const inputSchema = z.object({
  input1: z.string(),
  input2: z.number().optional(),
});

// Step 1
const stepOne = createStep({
  id: 'step-one',
  description: 'First step description',
  inputSchema,
  outputSchema: z.object({
    intermediate: z.string(),
    // Pass through inputs for next step
    ...inputSchema.shape,
  }),
  execute: async ({ inputData }) => {
    // Step logic
    return {
      intermediate: 'result from step 1',
      ...inputData,
    };
  },
});

// Step 2
const stepTwo = createStep({
  id: 'step-two',
  description: 'Second step description',
  inputSchema: z.object({
    intermediate: z.string(),
    input1: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
  }),
  execute: async ({ inputData }) => {
    const { intermediate, input1 } = inputData;
    // Step logic using previous step's output
    return {
      success: true,
      result: `Processed: ${input1} with ${intermediate}`,
    };
  },
});

// Create workflow
export const yourWorkflow = createWorkflow({
  id: 'your-workflow',
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
  }),
})
  .then(stepOne)
  .then(stepTwo);

// Commit to make executable
yourWorkflow.commit();
```

### 2. Register Workflow

Update `src/mastra/index.ts`:

```typescript
import { yourWorkflow } from './workflows/your-workflow';

export const mastra = new Mastra({
  workflows: {
    // ... existing workflows
    yourWorkflow,
  },
});
```

### 3. Create Tool Wrapper (Optional)

Create tool that executes the workflow:

```typescript
export const executeYourWorkflowTool = createTool({
  id: 'execute-your-workflow',
  inputSchema: yourWorkflow.inputSchema,
  outputSchema: yourWorkflow.outputSchema,
  execute: async ({ context }) => {
    return await yourWorkflow.execute({
      inputData: context,
    });
  },
});
```

## Accessing core-lib Services

### Use Singleton Pattern

```typescript
import { getFunctionsService, getCoreServices } from '../services/functions.service';

// Get functions service
const functionsService = await getFunctionsService();
await functionsService.listFunctions();

// Get all services
const services = await getCoreServices();
services.functionsService.searchFunctions('query');
services.envService.getEnv('KEY');
services.vectorService.search('query');
```

### Why Singleton?

- Services initialized once
- Shared across all tools
- Efficient resource usage
- Consistent state

## Tool Patterns

### Error Handling

Always catch and return structured errors:

```typescript
execute: async ({ context }) => {
  try {
    const result = await riskyOperation();
    return { success: true, result };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      result: null,
      error: errorMessage,
    };
  }
}
```

### Schema Descriptions

Use `.describe()` for better agent understanding:

```typescript
inputSchema: z.object({
  functionId: z.string()
    .describe('The unique identifier of the function to execute'),
  params: z.record(z.string(), z.any())
    .describe('Parameters to pass to the function as key-value pairs'),
})
```

### Optional Parameters

Use `.optional()` with `.default()`:

```typescript
limit: z.number()
  .optional()
  .default(10)
  .describe('Maximum number of results to return (default: 10)')
```

## Workflow Patterns

### Step Data Flow

Each step receives `inputData` from previous step:

```typescript
const step1 = createStep({
  execute: async ({ inputData }) => {
    return {
      newField: 'value',
      ...inputData, // Pass through for next step
    };
  },
});

const step2 = createStep({
  execute: async ({ inputData }) => {
    // Has access to newField and original inputData
    console.log(inputData.newField); // 'value'
  },
});
```

### Conditional Steps

Use step logic for branching:

```typescript
const conditionalStep = createStep({
  execute: async ({ inputData }) => {
    if (inputData.condition) {
      return { path: 'A', ...inputData };
    } else {
      return { path: 'B', ...inputData };
    }
  },
});
```

### Error Recovery

Catch errors in steps and decide how to proceed:

```typescript
const resilientStep = createStep({
  execute: async ({ inputData }) => {
    try {
      const result = await riskyOperation();
      return { success: true, result, ...inputData };
    } catch (error) {
      // Don't throw - return error state
      return {
        success: false,
        error: error.message,
        fallback: 'default value',
        ...inputData,
      };
    }
  },
});
```

## Testing

### Unit Test a Tool

```typescript
// your-tool.test.ts
import { describe, it, expect, vi } from 'vitest';
import { yourTool } from './your-tool.tool';

describe('yourTool', () => {
  it('should return success with valid input', async () => {
    const result = await yourTool.execute({
      context: { param1: 'test' },
      // Add runtimeContext if needed by Mastra
      runtimeContext: {},
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const result = await yourTool.execute({
      context: { param1: 'invalid' },
      runtimeContext: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### Unit Test a Workflow

```typescript
// your-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { yourWorkflow } from './your-workflow';

describe('yourWorkflow', () => {
  it('should execute all steps successfully', async () => {
    const result = await yourWorkflow.execute({
      inputData: {
        input1: 'test',
        input2: 123,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
});
```

## Best Practices

### Tool Design

- **Single responsibility** - One tool = one capability
- **Descriptive names** - Clear what the tool does
- **Strong typing** - Zod schemas for inputs/outputs
- **Error handling** - Always catch and return structured errors
- **Descriptions** - Help agent understand parameters

### Workflow Design

- **Logical steps** - Each step has clear purpose
- **Data flow** - Pass necessary data between steps
- **Error resilience** - Don't fail entire workflow on step error
- **Validation** - Validate inputs at workflow level
- **Reusability** - Make steps generic when possible

### Performance

- **Lazy loading** - Load services only when needed
- **Caching** - Cache expensive operations
- **Async** - Use async/await properly
- **Timeouts** - Add timeouts for external calls (future)

### Documentation

- **Code comments** - Explain WHY, not WHAT
- **Inline docs** - Document complex logic in code
- **Schema descriptions** - Help agents understand parameters
- **Update this guide** - When adding new patterns

## Common Issues

### Circular Dependencies

**Problem:** Agent imports tool, tool imports agent.

**Solution:** Use Mastra registry for lazy loading:
```typescript
// Instead of direct import
const agent = mastra.getAgent('agent-name');
```

### Type Errors in Tests

**Problem:** Missing `runtimeContext` property.

**Solution:** Add to test context:
```typescript
await tool.execute({
  context: { ... },
  runtimeContext: {}, // Add this
});
```

### Schema Validation Failures

**Problem:** `z.record(z.any())` fails with 2-3 arguments error.

**Solution:** Specify both key and value types:
```typescript
z.record(z.string(), z.any())
```

## File Structure

```
apps/mastra/src/mastra/
├── agents/
│   └── vargos-agent.ts           # Main agent
├── tools/
│   ├── list-functions.tool.ts    # One tool per file
│   ├── search-functions.tool.ts
│   └── your-tool.tool.ts         # Add yours here
├── workflows/
│   ├── create-function-workflow.ts
│   └── your-workflow.ts          # Add yours here
├── services/
│   └── functions.service.ts      # Singleton services
└── index.ts                       # Mastra instance
```

## Deployment Checklist

Before deploying new tools/workflows:

- [ ] TypeScript compiles (`pnpm build`)
- [ ] Tests pass (`pnpm test` - if tests exist)
- [ ] Tool added to agent
- [ ] Workflow registered in index.ts
- [ ] Environment variables documented
- [ ] Error handling implemented
- [ ] Schemas have descriptions
- [ ] Code follows existing patterns

## Need Help?

- **Mastra Docs:** https://mastra.ai/docs
- **Vargos Architecture:** See `architecture.md`
- **Examples:** Check existing tools in `src/mastra/tools/`
