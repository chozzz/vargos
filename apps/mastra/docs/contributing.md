# Contributing to Vargos

This guide provides technical details for contributors working on the Vargos codebase.

## Table of Contents

- [Getting Started](#getting-started)
- [Repository Structure](#repository-structure)
- [Development Workflow](#development-workflow)
- [Architecture Patterns](#architecture-patterns)
- [Adding New Agents](#adding-new-agents)
- [Adding New Tools](#adding-new-tools)
- [Adding New Workflows](#adding-new-workflows)
- [Testing Guidelines](#testing-guidelines)
- [Code Style](#code-style)
- [Common Issues](#common-issues)

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** (package manager)
- **PostgreSQL** (for Mastra memory)
- **Qdrant** (vector database, optional for development)
- **Rust/Cargo** (for chat app only)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/vargos.git
cd vargos

# Install dependencies
pnpm install

# Initialize git submodules (for chat app)
git submodule update --init --recursive

# Set up environment variables
cp apps/core/.env.example apps/core/.env
cp apps/mastra/.env.example apps/mastra/.env

# Edit .env files with your API keys and database URLs

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

### Environment Configuration

#### Required for Core (`apps/core/.env`)
```bash
CORE_PORT=4861
DATA_DIR=~/.vargos/data
FUNCTIONS_DIR=~/.vargos/functions/src
OPENAI_API_KEY=sk-...              # Get from OpenAI dashboard
QDRANT_URL=http://localhost:6333   # Or cloud Qdrant instance
QDRANT_API_KEY=                    # Optional, for cloud Qdrant
```

#### Required for Mastra (`apps/mastra/.env`)
```bash
MASTRA_PORT=4862
OPENAI_API_KEY=sk-...
CORE_MCP_CLIENT_URL=http://localhost:4861/mcp
DATABASE_URL=postgresql://user:pass@localhost:5432/vargos_mastra
```

#### Test Environment (`apps/mastra/.env.test`)
```bash
NODE_ENV=test
DATABASE_URL=postgresql://localhost:5432/vargos_mastra_test
DATA_DIR=/tmp/vargos-test-data
FUNCTIONS_DIR=/tmp/vargos-test-functions
OPENAI_API_KEY=sk-...  # Can use same key or test key
```

## Repository Structure

```
vargos/
├── apps/
│   ├── core/                      # NestJS API server
│   │   ├── src/
│   │   │   ├── functions/         # Functions module
│   │   │   ├── env/               # Environment module
│   │   │   ├── shell/             # Shell module
│   │   │   ├── llm/               # LLM module
│   │   │   ├── vector/            # Vector search module
│   │   │   └── app.module.ts      # Root module (MCP config)
│   │   └── test/                  # E2E tests
│   │
│   ├── mastra/                    # Mastra AI framework
│   │   ├── src/mastra/
│   │   │   ├── agents/            # AI agents
│   │   │   ├── tools/             # MCP tools
│   │   │   ├── workflows/         # Multi-agent workflows
│   │   │   ├── memory/            # PostgreSQL memory
│   │   │   ├── mcp/               # MCP client/server
│   │   │   └── services/          # Core service integration
│   │   ├── vitest.config.ts       # Test configuration
│   │   ├── vitest.globalSetup.ts  # Global test setup
│   │   └── vitest.setup.ts        # Test environment setup
│   │
│   ├── cli/                       # CLI agent (like Claude CLI)
│   └── chat/                      # AIChat (Rust, git submodule)
│
├── packages/
│   ├── core-lib/                  # Shared core services
│   │   ├── src/
│   │   │   ├── functions/         # Functions service
│   │   │   ├── env/               # Env service
│   │   │   ├── shell/             # Shell service
│   │   │   ├── llm/               # LLM service
│   │   │   └── vector/            # Vector service
│   │   ├── dist/                  # CommonJS build output
│   │   └── dist-esm/              # ES modules build output
│   │
│   ├── eslint-config/             # Shared ESLint config
│   ├── typescript-config/         # Shared TypeScript config
│   └── ui/                        # Shared UI components
│
├── docs/                          # Documentation
│   ├── architecture.md            # Main architecture doc
│   ├── contributing.md            # This file
│   ├── agents.md                  # Agent reference
│   ├── tools.md                   # Tools reference
│   └── functions.md               # Function repository design
│
├── turbo.json                     # Turborepo config
├── pnpm-workspace.yaml            # pnpm workspaces
└── package.json                   # Root package
```

## Development Workflow

### Running Development Servers

```bash
# Terminal 1: Start Core app (port 8180 in dev)
cd apps/core
pnpm dev

# Terminal 2: Start Mastra app (port 4862)
cd apps/mastra
mastra dev

# Or run all at once from root
pnpm dev
```

### Building Packages

```bash
# Build everything
pnpm build

# Build specific package
pnpm --filter @workspace/core-lib build
pnpm --filter @vargos/core build
pnpm --filter vargos-mastra build
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific test file
pnpm test env-tools.integration

# Coverage
pnpm test:cov
```

### Linting and Formatting

```bash
# Lint all packages
pnpm lint

# Format with Prettier
pnpm format

# Auto-fix lint issues
pnpm lint --fix
```

## Architecture Patterns

### 1. Four-Layer Architecture

Every module in the Core app follows this structure:

```
Module/
├── dto/                  # Request/Response DTOs for validation
│   ├── request.dto.ts
│   └── response.dto.ts
├── module-name.controller.ts  # HTTP endpoints (NO business logic)
├── module-name.service.ts     # Business logic, error handling
├── module-name.tool.ts        # MCP tool (1:1 with controller)
└── module-name.module.ts      # NestJS module config
```

#### Controller Layer
**Purpose:** HTTP endpoints + Swagger documentation ONLY

**Rules:**
- NO business logic
- NO try-catch (let exception filter handle it)
- NO logging (service layer logs)
- Returns service method results directly
- Uses DTOs for request/response validation

**Example:**
```typescript
@Controller('env')
@ApiTags('Environment')
export class EnvController {
  constructor(private readonly envService: EnvService) {}

  @Get(':key')
  @ApiOperation({ summary: 'Get environment variable' })
  async getEnv(@Param('key') key: string): Promise<GetEnvResponseDto> {
    // NO business logic - just call service
    return await this.envService.getEnv(key);
  }
}
```

#### Service Layer
**Purpose:** Business logic, logging, error handling

**Rules:**
- All application logic lives here
- Use `@Injectable()` decorator
- Log important operations
- Throw descriptive errors

**Example:**
```typescript
@Injectable()
export class EnvService {
  private readonly logger = new Logger(EnvService.name);

  async getEnv(key: string): Promise<GetEnvResponse> {
    this.logger.log(`Getting env variable: ${key}`);

    // Business logic
    const value = process.env[key];

    if (!value) {
      throw new NotFoundException(`Environment variable ${key} not found`);
    }

    return { key, value, exists: true };
  }
}
```

#### Tool Layer
**Purpose:** MCP tools that map 1:1 to controller methods

**Rules:**
- Uses `@Tool()` decorator
- Returns MCP format: `{ content, structuredContent, isError }`
- Include `outputSchema` for structured outputs (arrays/objects)
- Must include progress reporting
- Maps directly to controller endpoints

**Example:**
```typescript
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';

@Tool({
  name: 'get-env',
  description: 'Get an environment variable value',
  inputSchema: z.object({
    key: z.string().describe('Environment variable name'),
  }),
  outputSchema: z.object({
    key: z.string(),
    value: z.string(),
    exists: z.boolean(),
  }),
})
export class GetEnvTool {
  constructor(private readonly envController: EnvController) {}

  async execute(input: { key: string }) {
    // 1:1 mapping to controller
    const result = await this.envController.getEnv(input.key);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
      isError: false,
    };
  }
}
```

### 2. Singleton Service Pattern

Core services use singleton pattern for efficiency:

```typescript
// packages/core-lib/src/functions/functions.service.ts

let functionsServiceInstance: FunctionsService | null = null;

export async function getFunctionsService(): Promise<FunctionsService> {
  if (!functionsServiceInstance) {
    functionsServiceInstance = new FunctionsService({
      functionsDir: process.env.FUNCTIONS_DIR || '~/.vargos/functions/src',
    });
  }
  return functionsServiceInstance;
}
```

**Benefits:**
- Services initialized once, reused everywhere
- Avoids duplicate connections (DB, APIs)
- Test mode automatically isolated
- No circular dependency issues

### 3. 1:1 Tool Passthrough Pattern

Mastra tools are thin wrappers around core services:

```typescript
// apps/mastra/src/mastra/tools/env/get-env.tool.ts

export const getEnvTool = createTool({
  id: 'get-env',
  description: 'Get environment variable value',
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    key: z.string(),
    value: z.string(),
    exists: z.boolean(),
  }),
  execute: async ({ context }) => {
    // Direct passthrough to core service
    const envService = await getEnvService();
    return await envService.getEnv(context.key);
  },
});
```

**Key Principles:**
- NO business logic in tools
- Direct delegation to core services
- Type-safe schemas
- Minimal wrapper overhead

### 4. Structured Output Pattern

All agents use OpenAI structured output with Zod schemas:

```typescript
// Define output schema
const TestAnalysisSchema = z.object({
  passed: z.boolean(),
  testResults: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
  }),
  issues: z.array(z.object({
    type: z.enum(['test_failure', 'syntax_error', 'runtime_error']),
    description: z.string(),
    suggestion: z.string(),
  })),
});

// Use in agent
const agent = new Agent({
  name: 'Sandbox Agent',
  model: 'openai/gpt-4o',
  structuredOutput: {
    schema: TestAnalysisSchema,
  },
});

// Response is always typed correctly
const result: TestAnalysis = await agent.generate(prompt);
```

**Benefits:**
- Type safety end-to-end
- No JSON parsing errors
- Predictable agent responses
- Easy composition of multi-agent workflows

### 5. Agent Delegation Pattern

Agents delegate to other agents using lazy imports:

```typescript
// apps/mastra/src/mastra/agents/router-agent.ts

async function delegateToCurator(request: string) {
  // Lazy import prevents circular dependency
  const { curatorAgent } = await import('./curator-agent');

  return await curatorAgent.generate(request, {
    // context
  });
}
```

**Why Lazy Imports:**
- Prevents circular dependencies (all agents import each other)
- Faster startup (only load agents when needed)
- Easier to test (can mock agent modules)

## Adding New Agents

### Step 1: Create Agent File

**Location:** `apps/mastra/src/mastra/agents/your-agent.ts`

```typescript
import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { pgMemory } from '../memory/pg-memory';

// Define structured output schema
const YourAgentOutputSchema = z.object({
  // Define your output structure
  result: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
});

export type YourAgentOutput = z.infer<typeof YourAgentOutputSchema>;
export { YourAgentOutputSchema };

async function createYourAgent() {
  return new Agent({
    name: 'Your Agent',
    description: 'Brief description of what this agent does',

    instructions: `
You are the Your Agent - responsible for [specific responsibility].

## Your Responsibilities

1. **Main Task** - Description
2. **Secondary Task** - Description

## How to Approach Tasks

- Step-by-step process
- Decision criteria
- Output format

## Important Rules

- Rule 1
- Rule 2
    `,

    model: 'openai/gpt-4o',
    memory: pgMemory,

    // Structured output
    structuredOutput: {
      schema: YourAgentOutputSchema,
    },

    // Tools (if needed)
    tools: {
      // Add tools this agent can use
    },
  });
}

export const yourAgent = await createYourAgent();
```

### Step 2: Register Agent

**File:** `apps/mastra/src/mastra/index.ts`

```typescript
import { yourAgent } from './agents/your-agent';

export const mastra = new Mastra({
  // ...
  agents: {
    // Existing agents
    routerAgent,
    plannerAgent,
    curatorAgent,

    // Add your agent
    yourAgent,
  },
});
```

### Step 3: Add Tests

**File:** `apps/mastra/src/mastra/agents/your-agent.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { yourAgent } from './your-agent';

describe('YourAgent', () => {
  it('should have correct configuration', () => {
    expect(yourAgent.name).toBe('Your Agent');
    expect(yourAgent.model).toBe('openai/gpt-4o');
  });

  it('should process request and return structured output', async () => {
    const result = await yourAgent.generate('test prompt');

    // Verify structured output shape
    expect(result).toHaveProperty('result');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reasoning');
  });
});
```

### Step 4: Document Agent

Add entry to `docs/agents.md` with:
- Agent purpose
- Responsibilities
- Output schema
- Example usage
- Integration points

## Adding New Tools

### Step 1: Create Tool File

**Location:** `apps/mastra/src/mastra/tools/domain/tool-name.tool.ts`

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getCoreService } from '../../services/core.service';

export const yourTool = createTool({
  id: 'your-tool',
  description: 'Description of what this tool does',

  // Input schema
  inputSchema: z.object({
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Optional param2'),
  }),

  // Output schema
  outputSchema: z.object({
    result: z.string(),
    success: z.boolean(),
  }),

  // Implementation
  execute: async ({ context }) => {
    const { param1, param2 } = context;

    // Get core service
    const service = await getCoreService();

    // Execute operation
    const result = await service.doSomething(param1, param2);

    return {
      result: result.data,
      success: true,
    };
  },
});
```

### Step 2: Export Tool

**File:** `apps/mastra/src/mastra/tools/domain/index.ts`

```typescript
export { yourTool } from './tool-name.tool';
```

### Step 3: Add to Agent (if needed)

```typescript
import { yourTool } from '../tools/domain';

const agent = new Agent({
  // ...
  tools: {
    [yourTool.id]: yourTool,
  },
});
```

### Step 4: Add Tests

**File:** `apps/mastra/src/mastra/tools/domain/tool-name.tool.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { yourTool } from './tool-name.tool';
import { initializeCoreServices } from '../../services/core.service';

describe('yourTool', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  it('should have correct metadata', () => {
    expect(yourTool.id).toBe('your-tool');
    expect(yourTool.inputSchema).toBeDefined();
    expect(yourTool.outputSchema).toBeDefined();
  });

  it('should execute successfully with valid input', async () => {
    const result = await yourTool.execute({
      context: {
        param1: 'test',
        param2: 42,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
});
```

## Adding New Workflows

### Step 1: Create Workflow File

**Location:** `apps/mastra/src/mastra/workflows/your-workflow.workflow.ts`

```typescript
import { Workflow, Step } from '@mastra/core/workflow';
import { z } from 'zod';

// Define workflow schemas
const WorkflowInputSchema = z.object({
  input: z.string(),
});

const WorkflowOutputSchema = z.object({
  result: z.string(),
  steps: z.array(z.string()),
});

export const yourWorkflow = new Workflow({
  name: 'your-workflow',
  description: 'Description of workflow purpose',

  // Define steps
  steps: {
    // Step 1
    stepOne: new Step({
      id: 'step-one',
      description: 'First step description',
      execute: async ({ context, mastra }) => {
        // Step logic
        return {
          stepOneResult: 'data',
        };
      },
    }),

    // Step 2
    stepTwo: new Step({
      id: 'step-two',
      description: 'Second step description',
      execute: async ({ context, stepOne }) => {
        // Access previous step output
        const { stepOneResult } = stepOne;

        // Step logic
        return {
          stepTwoResult: 'more data',
        };
      },
    }),
  },

  // Define execution flow
  execute: async ({ stepOne, stepTwo }) => {
    return {
      result: stepTwo.stepTwoResult,
      steps: ['stepOne', 'stepTwo'],
    };
  },
});
```

### Step 2: Register Workflow

**File:** `apps/mastra/src/mastra/index.ts`

```typescript
import { yourWorkflow } from './workflows/your-workflow.workflow';

export const mastra = new Mastra({
  // ...
  workflows: {
    // Existing workflows
    functionSearchWorkflow,
    functionCreationWorkflow,

    // Add your workflow
    yourWorkflow,
  },
});
```

### Step 3: Add Tests

**File:** `apps/mastra/src/mastra/workflows/your-workflow.workflow.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { yourWorkflow } from './your-workflow.workflow';
import { initializeCoreServices } from '../services/core.service';

describe('yourWorkflow', () => {
  beforeAll(async () => {
    await initializeCoreServices();
  });

  it('should execute all steps successfully', async () => {
    const result = await yourWorkflow.execute({
      input: 'test input',
    });

    expect(result.result).toBeDefined();
    expect(result.steps).toHaveLength(2);
  });
});
```

## Testing Guidelines

### Test File Naming

- **Unit tests:** `*.test.ts`
- **Integration tests:** `*.integration.test.ts`
- **E2E tests:** `*.e2e-spec.ts`

### Test Organization

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('ComponentName', () => {
  beforeAll(async () => {
    // Setup - initialize services
    await initializeCoreServices();
  });

  afterAll(async () => {
    // Cleanup - close connections
  });

  describe('methodName', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = 'test';

      // Act
      const result = await method(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case', async () => {
      // Test edge cases
    });

    it('should throw error on invalid input', async () => {
      await expect(method(null)).rejects.toThrow();
    });
  });
});
```

### Test Isolation

**IMPORTANT:** Tests must never pollute production `.env`

**Required Setup:**
1. Create `.env.test` with test database URL
2. Use `NODE_ENV=test` (set in `vitest.globalSetup.ts`)
3. FilepathEnvProvider automatically uses `.env.test` in test mode
4. Use temporary directories for test data

**Example:**
```typescript
// vitest.setup.ts
beforeAll(() => {
  // Load .env.test
  dotenvConfig({ path: path.resolve(process.cwd(), '.env.test') });

  // Use temporary directories
  process.env.DATA_DIR = path.join(os.tmpdir(), 'vargos-test-data');
  process.env.FUNCTIONS_DIR = path.join(os.tmpdir(), 'vargos-test-functions');
});
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific file
pnpm test env-tools

# Coverage
pnpm test:cov

# Verbose output
pnpm test --reporter=verbose
```

## Code Style

### File Naming

- **kebab-case** for files: `env.service.ts`, `get-env.tool.ts`
- **PascalCase** for classes: `EnvService`, `GetEnvTool`

### Import Organization

```typescript
// 1. External packages
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

// 2. Internal packages
import { getFunctionsService } from '@workspace/core-lib';

// 3. Local modules
import { EnvService } from '../env/env.service';
import { GetEnvDto } from './dto/get-env.dto';
```

### TypeScript Conventions

```typescript
// Use interfaces for DTOs and data shapes
interface UserData {
  id: string;
  name: string;
}

// Use types for unions and computed types
type Status = 'active' | 'inactive';
type Result<T> = { success: true; data: T } | { success: false; error: string };

// Use Zod for runtime validation
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});

// Prefer async/await over promises
async function fetchData(): Promise<UserData> {
  const response = await fetch('/api/users');
  return await response.json();
}

// Use descriptive variable names
const isUserActive = user.status === 'active';  // Good
const x = user.status === 'active';            // Bad
```

### Error Handling

```typescript
// Service layer - throw descriptive errors
async function getUser(id: string): Promise<User> {
  const user = await db.findById(id);

  if (!user) {
    throw new NotFoundException(`User with ID ${id} not found`);
  }

  return user;
}

// Controller layer - no try-catch (exception filter handles it)
@Get(':id')
async getUser(@Param('id') id: string): Promise<UserDto> {
  return await this.userService.getUser(id);  // Let errors bubble up
}
```

### Logging

```typescript
// Service layer - log important operations
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  async createUser(data: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user: ${data.email}`);

    try {
      const user = await this.db.create(data);
      this.logger.log(`User created successfully: ${user.id}`);
      return user;
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`);
      throw error;
    }
  }
}
```

## Common Issues

### Issue 1: Cannot find package '@workspace/core-lib'

**Cause:** Core-lib not built or bundler configuration issue

**Fix:**
```bash
# 1. Rebuild core-lib
pnpm --filter @workspace/core-lib build

# 2. Check mastra bundler config
# Ensure transpilePackages includes @workspace/core-lib
# Do NOT include in externals array
```

### Issue 2: pgMemory undefined / dynamic import error

**Cause:** Dynamic imports causing bundling issues

**Fix:** Use static imports
```typescript
// ✅ Good - static import
import { pgMemory } from '../memory/pg-memory';

const agent = new Agent({
  memory: pgMemory,
});

// ❌ Bad - dynamic import
const { pgMemory } = await import('../memory/pg-memory');
```

### Issue 3: Tests failing when run together

**Cause:** Race conditions from parallel execution

**Fix:** Consolidate tests into single file
```typescript
// Instead of separate files:
// - get-env.tool.test.ts
// - set-env.tool.test.ts
// - search-env.tool.test.ts

// Use one file:
// - env-tools.integration.test.ts

describe('Environment Tools', () => {
  describe('getEnvTool', () => { /* tests */ });
  describe('setEnvTool', () => { /* tests */ });
  describe('searchEnvTool', () => { /* tests */ });
});
```

### Issue 4: Production .env being modified during tests

**Cause:** Test isolation not properly configured

**Fix:** Ensure proper test isolation
```bash
# 1. Create .env.test file
DATABASE_URL=postgresql://localhost:5432/vargos_mastra_test
NODE_ENV=test

# 2. Check vitest.globalSetup.ts sets NODE_ENV=test

# 3. Verify FilepathEnvProvider uses .env.test in test mode
```

### Issue 5: Mastra dev cold start race condition

**Cause:** Core app not ready when Mastra tries to connect to MCP

**Fix:**
```bash
# Start Core first
cd apps/core
pnpm dev

# Wait for "Server listening on port 8180"

# Then start Mastra
cd apps/mastra
mastra dev
```

### Issue 6: TypeScript compilation errors after changes

**Cause:** Stale build cache

**Fix:**
```bash
# Clean build artifacts
rm -rf dist dist-esm .tsbuildinfo

# Force rebuild
npx tsc --build --force

# Rebuild package
pnpm build
```

## Pull Request Guidelines

### Before Submitting

- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Code formatted (`pnpm format`)
- [ ] Documentation updated (if adding features)
- [ ] Tests added for new functionality
- [ ] .env.test not polluted with test data
- [ ] No console.log() statements (use logger)

### PR Title Format

```
<type>: <description>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- test: Adding tests
- docs: Documentation changes
- chore: Maintenance tasks
```

**Examples:**
- `feat: add weather agent for real-time forecasts`
- `fix: resolve env test isolation race condition`
- `refactor: convert dynamic pgMemory imports to static`
- `docs: update architecture with Phase 4 agents`

### PR Description Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- Change 1
- Change 2

## Testing
How was this tested?

## Related Issues
Closes #123
```

## Resources

- [Mastra Documentation](https://mastra.ai/docs)
- [NestJS Documentation](https://docs.nestjs.com)
- [Model Context Protocol Spec](https://modelcontextprotocol.io)
- [Qdrant Documentation](https://qdrant.tech/documentation)
- [Vitest Documentation](https://vitest.dev)

## Getting Help

- **GitHub Issues:** Report bugs and request features
- **Discussions:** Ask questions and share ideas
- **Discord:** Join the community chat (link TBD)

## License

MIT License - See LICENSE file for details
