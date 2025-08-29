# Vargos Agents Reference

This document provides a comprehensive reference for all Vargos agents, their responsibilities, structured output schemas, and usage examples.

## Table of Contents

- [Overview](#overview)
- [Phase 1: Foundation Agents](#phase-1-foundation-agents)
  - [Router Agent](#router-agent)
  - [Planner Agent](#planner-agent)
  - [Curator Agent](#curator-agent)
  - [Permission Agent](#permission-agent)
- [Phase 2: Creation Pipeline Agents](#phase-2-creation-pipeline-agents)
  - [Function Creator Agent](#function-creator-agent)
  - [Sandbox Agent](#sandbox-agent)
- [Phase 3: Research & Memory Agents](#phase-3-research--memory-agents)
  - [Research Agent](#research-agent)
  - [Memory Agent](#memory-agent)
- [Legacy Agents](#legacy-agents)
- [Agent Interaction Patterns](#agent-interaction-patterns)

## Overview

Vargos implements a multi-agent architecture where specialized agents handle specific responsibilities. All agents:

- Use **OpenAI GPT-4o** or **GPT-4o-mini** models
- Return **structured output** via Zod schemas (type-safe)
- Share **PostgreSQL memory** (pgMemory) for conversation context
- Follow **agent delegation pattern** using lazy imports
- Are registered in `apps/mastra/src/mastra/index.ts`

### Common Agent Properties

```typescript
const agent = new Agent({
  name: string,              // Human-readable name
  description: string,       // Brief purpose description
  instructions: string,      // Detailed prompt/instructions
  model: string,             // OpenAI model (gpt-4o, gpt-4o-mini)
  memory: Memory,            // PostgreSQL memory instance
  tools: Record<string, Tool>, // Available tools
  structuredOutput?: {       // Optional structured output
    schema: ZodSchema
  }
});
```

## Phase 1: Foundation Agents

### Router Agent

**File:** `apps/mastra/src/mastra/agents/router-agent.ts`

#### Purpose
Entry point for all user requests. Analyzes intent and routes to appropriate agent or workflow.

#### Model
`openai/gpt-4o-mini` (fast, cheap for routing decisions)

#### Responsibilities
1. Analyze user intent
2. Determine task complexity
3. Identify requirements (permissions, function search, research)
4. Route to appropriate agent or handle directly

#### Output Schema

```typescript
const RouterOutputSchema = z.object({
  intent: z.enum([
    'direct_answer',      // Can answer immediately
    'search_function',    // Search for existing function
    'execute_function',   // Execute a known function
    'create_function',    // Create new function
    'research',           // Need external information
    'plan_task',          // Complex task requiring planning
    'recall_memory',      // Retrieve from memory
    'update_memory',      // Store in memory
  ]),

  needsPlanning: z.boolean(),
  needsPermission: z.boolean(),
  needsCurator: z.boolean(),

  extractedEntities: z.object({
    functionName: z.string(),      // Extracted function name
    functionQuery: z.string(),     // Search query
    parametersJson: z.string(),    // JSON string of params
    taskDescription: z.string(),   // Task for planning
  }),

  confidence: z.number().min(0).max(1),
  reasoning: z.string(),

  nextAgent: z.enum([
    'planner',
    'curator',
    'permission',
    'research',
    'memory',
    'none',  // Handle directly
  ]),
});
```

#### Routing Logic

| Intent             | Next Agent   | Conditions                              |
|--------------------|--------------|-----------------------------------------|
| direct_answer      | none         | Simple questions, no tools needed       |
| search_function    | curator      | User wants to find functions            |
| execute_function   | curator      | Find then execute                       |
| create_function    | permission   | Needs approval first                    |
| research           | research     | External information required           |
| plan_task          | planner      | Complex multi-step tasks                |
| recall_memory      | memory       | Query conversation history              |
| update_memory      | memory       | Store preferences/facts                 |

#### Example Usage

```typescript
const result = await routerAgent.generate(
  'Create a function to send emails via SendGrid',
  {
    structuredOutput: { schema: RouterOutputSchema }
  }
);

// result.object contains RouterOutput
console.log(result.object.intent);       // 'create_function'
console.log(result.object.nextAgent);    // 'permission'
console.log(result.object.needsPlanning); // true
console.log(result.object.needsCurator);  // true
```

#### Example Output

**Input:** "Create a function to send emails via SendGrid"

```json
{
  "intent": "create_function",
  "needsPlanning": true,
  "needsPermission": true,
  "needsCurator": true,
  "extractedEntities": {
    "functionName": "",
    "functionQuery": "email sending",
    "parametersJson": "",
    "taskDescription": "Send emails via SendGrid API"
  },
  "confidence": 0.9,
  "reasoning": "Function creation requires permission, planning, and checking for existing solutions",
  "nextAgent": "permission"
}
```

---

### Planner Agent

**File:** `apps/mastra/src/mastra/agents/planner-agent.ts`

#### Purpose
Decomposes complex tasks into clear, executable steps with dependencies.

#### Model
`openai/gpt-4o` (strong model for strategic planning)

#### Responsibilities
1. Analyze task complexity
2. Break down into sequential steps
3. Identify step dependencies
4. Assign agents to steps
5. Estimate duration and risks

#### Output Schema

```typescript
const ExecutionStepSchema = z.object({
  stepNumber: z.number(),
  action: z.string(),                    // What needs to be done
  agent: z.enum([
    'curator',
    'creator',
    'sandbox',
    'research',
    'memory',
    'permission',
    'none',  // Direct tool use
  ]),
  tool: z.string(),                      // Tool if agent is 'none'
  dependencies: z.array(z.number()),     // Step numbers
  estimatedDuration: z.enum(['quick', 'medium', 'long']),
  requiresUserInput: z.boolean(),
});

const PlannerOutputSchema = z.object({
  taskSummary: z.string(),
  complexity: z.enum(['low', 'medium', 'high']),
  steps: z.array(ExecutionStepSchema),
  totalSteps: z.number(),
  parallelizable: z.boolean(),
  requiredCapabilities: z.array(z.string()),
  risks: z.array(z.string()),
  estimatedCompletion: z.enum(['seconds', 'minutes', 'hours']),
  reasoning: z.string(),
});
```

#### Planning Principles

1. **Search Before Create** - Always check Curator first
2. **Get Permission Early** - Flag destructive operations upfront
3. **Minimize Steps** - Don't over-complicate
4. **Clear Dependencies** - Mark what depends on what
5. **Realistic Estimates** - quick (<10s), medium (10-60s), long (>60s)

#### Example Usage

```typescript
const plan = await plannerAgent.generate(
  'Create a function to fetch weather data',
  {
    structuredOutput: { schema: PlannerOutputSchema }
  }
);

// Execute steps sequentially
for (const step of plan.object.steps) {
  if (step.agent === 'curator') {
    await curatorAgent.generate(/* ... */);
  }
  // ... handle other agents
}
```

#### Example Output

**Input:** "Create a function to fetch weather data"

```json
{
  "taskSummary": "Create weather fetching function with API integration",
  "complexity": "medium",
  "steps": [
    {
      "stepNumber": 1,
      "action": "Search for existing weather functions",
      "agent": "curator",
      "tool": "",
      "dependencies": [],
      "estimatedDuration": "quick",
      "requiresUserInput": false
    },
    {
      "stepNumber": 2,
      "action": "Ask user permission to create new function",
      "agent": "permission",
      "tool": "",
      "dependencies": [1],
      "estimatedDuration": "quick",
      "requiresUserInput": true
    },
    {
      "stepNumber": 3,
      "action": "Research weather API documentation",
      "agent": "research",
      "tool": "",
      "dependencies": [2],
      "estimatedDuration": "medium",
      "requiresUserInput": false
    },
    {
      "stepNumber": 4,
      "action": "Generate function code with tests",
      "agent": "creator",
      "tool": "",
      "dependencies": [3],
      "estimatedDuration": "long",
      "requiresUserInput": false
    },
    {
      "stepNumber": 5,
      "action": "Run tests in sandbox",
      "agent": "sandbox",
      "tool": "",
      "dependencies": [4],
      "estimatedDuration": "medium",
      "requiresUserInput": false
    }
  ],
  "totalSteps": 5,
  "parallelizable": false,
  "requiredCapabilities": ["curator", "permission", "research", "creator", "sandbox"],
  "risks": [
    "Weather API may require API key from user",
    "Tests might fail if API is down"
  ],
  "estimatedCompletion": "minutes",
  "reasoning": "Must search first, get permission, research API, then create and test"
}
```

---

### Curator Agent

**File:** `apps/mastra/src/mastra/agents/curator-agent.ts`

#### Purpose
Searches function repository and recommends reuse, extension, or creation.

#### Model
`openai/gpt-4o` (strong model for analysis)

#### Responsibilities
1. Semantic search of function repository
2. Analyze match quality
3. Recommend reuse/extend/create
4. Prevent duplicate functions
5. Handle versioning (v1, v2, v3)

#### Tools
- `search-functions` - Semantic search via vector DB
- `list-functions` - List all functions (use sparingly)
- `get-function-metadata` - Get detailed metadata

#### Output Schema

```typescript
const FunctionRecommendationSchema = z.object({
  functionId: z.string(),
  name: z.string(),
  description: z.string(),
  matchScore: z.number().min(0).max(1),
  version: z.string(),
});

const CuratorOutputSchema = z.object({
  query: z.string(),
  foundFunctions: z.boolean(),
  recommendations: z.array(FunctionRecommendationSchema),

  topMatch: z.object({
    functionId: z.string(),
    confidence: z.number().min(0).max(1),
  }),

  decision: z.enum([
    'use_existing',         // Perfect match (confidence > 0.8)
    'extend_existing',      // Similar (confidence 0.5-0.8)
    'create_new',           // Nothing suitable (confidence < 0.5)
    'needs_clarification',  // Query too vague
  ]),

  reasoning: z.string(),
  suggestedAction: z.string(),
});
```

#### Decision Framework

| Decision              | Confidence | Action                                   |
|-----------------------|------------|------------------------------------------|
| use_existing          | > 0.8      | Use function directly                    |
| extend_existing       | 0.5 - 0.8  | Modify or create new version             |
| create_new            | < 0.5      | No relevant functions, create brand new  |
| needs_clarification   | N/A        | Query too vague, ask user                |

#### Example Usage

```typescript
const result = await curatorAgent.generate(
  'Find functions that send emails via SendGrid',
  {
    structuredOutput: { schema: CuratorOutputSchema }
  }
);

if (result.object.decision === 'use_existing') {
  // Use recommended function
  const functionId = result.object.topMatch.functionId;
  await executeFunctionTool.execute({ functionId, input: {} });
} else if (result.object.decision === 'create_new') {
  // Proceed to function creation
  await functionCreatorAgent.generate(/* ... */);
}
```

#### Example Output

**Input:** "Send emails via SendGrid"

```json
{
  "query": "Send emails via SendGrid",
  "foundFunctions": true,
  "recommendations": [
    {
      "functionId": "sendgrid-api",
      "name": "sendgrid-api",
      "description": "Send emails using SendGrid API with template support",
      "matchScore": 0.92,
      "version": "v1"
    }
  ],
  "topMatch": {
    "functionId": "sendgrid-api",
    "confidence": 0.92
  },
  "decision": "use_existing",
  "reasoning": "Found exact match - sendgrid-api function already implements SendGrid email sending with high confidence",
  "suggestedAction": "Use sendgrid-api function directly. No need to create new function."
}
```

---

### Permission Agent

**File:** `apps/mastra/src/mastra/agents/permission-agent.ts`

#### Purpose
Handles user approval flows and explains proposed actions transparently.

#### Model
`openai/gpt-4o` (strong model for clear communication)

#### Responsibilities
1. Present proposed actions clearly
2. Get explicit user approval
3. Track permission scope (once, session, always)
4. Explain risks and alternatives

#### Output Schema

```typescript
const PermissionRequestSchema = z.object({
  action: z.string(),  // Clear description

  actionType: z.enum([
    'create_function',
    'modify_function',
    'execute_shell',
    'write_file',
    'modify_env',
    'crawl_web',
    'execute_sandbox',
    'access_api',
  ]),

  impact: z.enum(['low', 'medium', 'high']),

  details: z.object({
    filesAffected: z.array(z.string()),
    commandsToRun: z.array(z.string()),
    envVarsNeeded: z.array(z.string()),
    urlsToAccess: z.array(z.string()),
    estimatedDuration: z.string(),
  }),

  reasoning: z.string(),
  risks: z.array(z.string()),
  alternatives: z.array(z.string()),

  recommendedScope: z.enum([
    'allow_once',        // Just this time
    'allow_session',     // For this conversation
    'deny',              // Do not allow
    'ask_more_info',     // Need clarification
  ]),

  userFriendlyPrompt: z.string(),
});

const PermissionResponseSchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  scope: z.enum(['once', 'session', 'denied']),
  userResponse: z.string().optional(),
  timestamp: z.string(),
});
```

#### Permission Scopes

| Scope          | Duration         | Use When                              |
|----------------|------------------|---------------------------------------|
| allow_once     | Single action    | Unique, high impact, rarely repeated  |
| allow_session  | Conversation     | Repeated similar actions              |
| deny           | Permanent        | User refuses or action too risky      |

#### Impact Assessment

| Impact | Examples                                              |
|--------|-------------------------------------------------------|
| Low    | Reading files, searching functions, queries           |
| Medium | Creating functions, modifying code, temp files        |
| High   | Shell commands, env changes, paid APIs, irreversible  |

#### Example Usage

```typescript
const request = await permissionAgent.generate(
  'Need to create send-email function that requires SENDGRID_API_KEY',
  {
    structuredOutput: { schema: PermissionRequestSchema }
  }
);

// Display to user
console.log(request.object.userFriendlyPrompt);
console.log('Impact:', request.object.impact);
console.log('Risks:', request.object.risks);

// Get user approval
const approved = await getUserApproval();

if (approved) {
  // Proceed with function creation
  await functionCreatorAgent.generate(/* ... */);
}
```

#### Example Output

**Input:** "Create new function: send-email"

```json
{
  "action": "Create new function: send-email",
  "actionType": "create_function",
  "impact": "medium",
  "details": {
    "filesAffected": [
      "~/.vargos/functions/email/send-email/v1/index.ts",
      "~/.vargos/functions/email/send-email/v1/send-email.meta.json",
      "~/.vargos/functions/email/send-email/v1/send-email.test.ts"
    ],
    "commandsToRun": [],
    "envVarsNeeded": ["SENDGRID_API_KEY"],
    "urlsToAccess": [],
    "estimatedDuration": "2-3 minutes (includes testing)"
  },
  "reasoning": "No existing function can send emails via SendGrid API",
  "risks": [
    "Requires SENDGRID_API_KEY environment variable",
    "Tests may fail if API key is invalid",
    "Will create 3 new files in function repository"
  ],
  "alternatives": [
    "Use existing send-email-smtp function with SMTP instead",
    "Manually create function without agent assistance"
  ],
  "recommendedScope": "allow_once",
  "userFriendlyPrompt": "May I create a new 'send-email' function that uses SendGrid API? This will create 3 files and requires your SENDGRID_API_KEY environment variable. Estimated time: 2-3 minutes."
}
```

---

## Phase 2: Creation Pipeline Agents

### Function Creator Agent

**File:** `apps/mastra/src/mastra/agents/function-creator-agent.ts`

#### Purpose
Generates production-quality TypeScript functions with tests and metadata.

#### Model
`openai/gpt-4o` (strong model for code generation)

#### Responsibilities
1. Generate clean TypeScript code
2. Create comprehensive metadata (inputs, outputs, env vars)
3. Write tests with good coverage
4. Follow best practices (types, error handling, docs)

#### Tools
- `create-function` - Save generated function to repository

#### Output Schema

```typescript
const FunctionGenerationSchema = z.object({
  name: z.string(),  // kebab-case
  description: z.string(),
  version: z.string(),  // Semantic versioning (1.0.0)
  category: z.union([z.string(), z.array(z.string())]),
  tags: z.array(z.string()),
  requiredEnvVars: z.array(z.string()),

  input: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    defaultValue: z.string(),
  })),

  output: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })),

  code: z.string(),      // Complete TypeScript implementation
  tests: z.string(),     // Complete test file
  reasoning: z.string(), // Design decisions
});
```

#### Code Generation Guidelines

1. **Input Validation** - Always validate inputs at start
2. **Error Handling** - Wrap external calls in try-catch
3. **Environment Variables** - List ALL required env vars
4. **Documentation** - JSDoc comments and inline explanations
5. **TypeScript Best Practices** - Strict types, no `any`

#### Test Generation Guidelines

1. **Test Structure** - Use Vitest, describe/it blocks
2. **Test Coverage** - Valid inputs, invalid inputs, edge cases
3. **Mocking** - Mock external dependencies when needed

#### Example Usage

```typescript
const result = await functionCreatorAgent.generate(
  'Create a function to send emails via SendGrid with template support',
  {
    structuredOutput: { schema: FunctionGenerationSchema }
  }
);

// Save function using create-function tool
await createFunctionTool.execute({
  context: {
    name: result.object.name,
    code: result.object.code,
    tests: result.object.tests,
    metadata: {
      description: result.object.description,
      version: result.object.version,
      category: result.object.category,
      input: result.object.input,
      output: result.object.output,
      requiredEnvVars: result.object.requiredEnvVars,
    }
  }
});
```

#### Example Output

**Input:** "Create a function to send emails via SendGrid"

```json
{
  "name": "send-email-sendgrid",
  "description": "Send emails using SendGrid API with template support",
  "version": "1.0.0",
  "category": "communication",
  "tags": ["email", "sendgrid", "notification"],
  "requiredEnvVars": ["SENDGRID_API_KEY"],
  "input": [
    {
      "name": "to",
      "type": "string",
      "description": "Recipient email address",
      "defaultValue": ""
    },
    {
      "name": "subject",
      "type": "string",
      "description": "Email subject line",
      "defaultValue": ""
    },
    {
      "name": "content",
      "type": "string",
      "description": "Email body content (plain text or HTML)",
      "defaultValue": ""
    }
  ],
  "output": [
    {
      "name": "messageId",
      "type": "string",
      "description": "SendGrid message ID"
    },
    {
      "name": "success",
      "type": "boolean",
      "description": ""
    }
  ],
  "code": "export interface FunctionInput {\n  to: string;\n  subject: string;\n  content: string;\n}\n\nexport interface FunctionOutput {\n  messageId: string;\n  success: boolean;\n}\n\nexport async function execute(input: FunctionInput): Promise<FunctionOutput> {\n  const apiKey = process.env.SENDGRID_API_KEY;\n  if (!apiKey) {\n    throw new Error('SENDGRID_API_KEY environment variable is required');\n  }\n\n  // Validate inputs\n  if (!input.to || !input.subject || !input.content) {\n    throw new Error('Missing required fields: to, subject, content');\n  }\n\n  // Send email via SendGrid API\n  try {\n    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {\n      method: 'POST',\n      headers: {\n        'Authorization': `Bearer ${apiKey}`,\n        'Content-Type': 'application/json',\n      },\n      body: JSON.stringify({\n        personalizations: [{ to: [{ email: input.to }] }],\n        from: { email: 'noreply@example.com' },\n        subject: input.subject,\n        content: [{ type: 'text/html', value: input.content }],\n      }),\n    });\n\n    if (!response.ok) {\n      throw new Error(`SendGrid API error: ${response.statusText}`);\n    }\n\n    const messageId = response.headers.get('X-Message-Id') || 'unknown';\n\n    return {\n      messageId,\n      success: true,\n    };\n  } catch (error) {\n    throw new Error(`Failed to send email: ${error.message}`);\n  }\n}",
  "tests": "import { describe, it, expect, beforeAll } from 'vitest';\nimport { execute } from './index';\n\ndescribe('send-email-sendgrid', () => {\n  beforeAll(() => {\n    if (!process.env.SENDGRID_API_KEY) {\n      throw new Error('SENDGRID_API_KEY required for tests');\n    }\n  });\n\n  it('should send email with valid input', async () => {\n    const result = await execute({\n      to: 'test@example.com',\n      subject: 'Test Email',\n      content: 'This is a test',\n    });\n\n    expect(result.success).toBe(true);\n    expect(result.messageId).toBeDefined();\n  });\n\n  it('should throw error for missing SENDGRID_API_KEY', async () => {\n    const originalKey = process.env.SENDGRID_API_KEY;\n    delete process.env.SENDGRID_API_KEY;\n\n    await expect(execute({\n      to: 'test@example.com',\n      subject: 'Test',\n      content: 'Test',\n    })).rejects.toThrow('SENDGRID_API_KEY');\n\n    process.env.SENDGRID_API_KEY = originalKey;\n  });\n\n  it('should throw error for missing required fields', async () => {\n    await expect(execute({\n      to: '',\n      subject: 'Test',\n      content: 'Test',\n    })).rejects.toThrow('Missing required fields');\n  });\n});",
  "reasoning": "Function uses SendGrid API for reliable email delivery. Includes comprehensive validation, error handling, and typed interfaces. Tests cover success case, missing env var, and invalid inputs."
}
```

---

### Sandbox Agent

**File:** `apps/mastra/src/mastra/agents/sandbox-agent.ts`

#### Purpose
Executes function tests safely and provides diagnostic feedback.

#### Model
`openai/gpt-4o` (strong model for error analysis)

#### Responsibilities
1. Run tests in isolated environment
2. Parse test output (stdout/stderr)
3. Categorize issues by type
4. Determine if retry is worthwhile
5. Provide actionable fix suggestions

#### Tools
- `test-function` - Run vitest tests for function

#### Output Schema

```typescript
const TestAnalysisSchema = z.object({
  passed: z.boolean(),

  testResults: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),

  issues: z.array(z.object({
    type: z.enum([
      'test_failure',         // Tests ran but assertions failed
      'syntax_error',         // TypeScript compilation failed
      'runtime_error',        // Unhandled exception
      'env_missing',          // Required env var not set
      'dependency_missing',   // npm package not installed
    ]),
    description: z.string(),
    location: z.string(),
    suggestion: z.string(),
  })),

  canRetry: z.boolean(),
  suggestedFixes: z.array(z.string()),
  reasoning: z.string(),
});
```

#### Issue Types

| Type                | Can Retry? | Description                              |
|---------------------|------------|------------------------------------------|
| test_failure        | Yes        | Logic error, fix code then retry         |
| syntax_error        | No         | Must fix TypeScript errors first         |
| runtime_error       | Yes        | Add error handling, null checks          |
| env_missing         | Yes        | Set environment variable then retry      |
| dependency_missing  | Yes        | Install package (`pnpm add`) then retry  |

#### Example Usage

```typescript
const result = await sandboxAgent.generate(
  'Test function: send-email-sendgrid',
  {
    structuredOutput: { schema: TestAnalysisSchema }
  }
);

if (result.object.passed) {
  console.log('All tests passed!');
} else {
  console.log('Test failures:', result.object.issues);
  console.log('Suggested fixes:', result.object.suggestedFixes);

  if (result.object.canRetry) {
    // Apply fixes and retry
  }
}
```

#### Example Output

**Input:** Test output with missing env var

```json
{
  "passed": false,
  "testResults": {
    "total": 2,
    "passed": 1,
    "failed": 1,
    "skipped": 0
  },
  "issues": [
    {
      "type": "env_missing",
      "description": "API_KEY environment variable is not defined",
      "location": "index.ts:10",
      "suggestion": "Add API_KEY to .env file or ensure it's set in the environment"
    }
  ],
  "canRetry": true,
  "suggestedFixes": [
    "Set API_KEY environment variable",
    "Add API_KEY=your_key_here to .env file",
    "Verify function metadata lists API_KEY in requiredEnvVars"
  ],
  "reasoning": "Tests partially passed (1/2). The failure is due to missing API_KEY environment variable at line 10. This is fixable by setting the environment variable. Retry is recommended after fix."
}
```

---

## Phase 3: Research & Memory Agents

### Research Agent

**File:** `apps/mastra/src/mastra/agents/research-agent.ts`

#### Purpose
Gathers information from various sources with verification and confidence scoring.

#### Model
`openai/gpt-4o` (strong model for research and reasoning)

#### Responsibilities
1. Search for current, relevant information
2. Evaluate source credibility
3. Cross-reference across sources
4. Rate confidence in findings

#### Tools
None currently (web-search and docs-search tools planned)

#### Output Schema

```typescript
const ResearchResultSchema = z.object({
  query: z.string(),

  findings: z.array(z.object({
    title: z.string(),
    content: z.string(),
    source: z.string(),  // URL or reference
    relevance: z.enum(['high', 'medium', 'low']),
  })),

  summary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  limitations: z.string(),
  reasoning: z.string(),
});
```

#### Confidence Assessment

| Confidence | Criteria                                        |
|------------|-------------------------------------------------|
| High       | Multiple authoritative sources agree, current   |
| Medium     | Limited sources, minor inconsistencies          |
| Low        | Single source, outdated, or unverified          |

#### Example Usage

```typescript
const result = await researchAgent.generate(
  'Research SendGrid API rate limits and best practices',
  {
    structuredOutput: { schema: ResearchResultSchema }
  }
);

console.log('Summary:', result.object.summary);
console.log('Confidence:', result.object.confidence);
console.log('Findings:', result.object.findings);
```

---

### Memory Agent

**File:** `apps/mastra/src/mastra/agents/memory-agent.ts`

#### Purpose
Manages hybrid global + thread memory for conversation context.

#### Model
`openai/gpt-4o` (strong model for context understanding)

#### Responsibilities
1. Store important facts, decisions, and context
2. Retrieve relevant memories for current context
3. Search memories by topic or pattern
4. Provide insights from memory patterns

#### Tools
None currently (memory storage/retrieval tools planned)

#### Output Schema

```typescript
const MemoryOperationSchema = z.object({
  operation: z.enum(['store', 'retrieve', 'search', 'summarize']),
  scope: z.enum(['global', 'thread', 'both']),

  memories: z.array(z.object({
    id: z.string(),
    content: z.string(),
    type: z.enum(['fact', 'preference', 'decision', 'context', 'pattern']),
    relevance: z.enum(['high', 'medium', 'low']),
    timestamp: z.string(),
    scope: z.enum(['global', 'thread']),
  })),

  summary: z.string(),
  insights: z.string(),
  reasoning: z.string(),
});
```

#### Memory Scopes

| Scope    | Storage      | Lifetime         | Use Cases                          |
|----------|--------------|------------------|------------------------------------|
| Thread   | PostgreSQL   | Per-conversation | Context, decisions, recent actions |
| Global   | Qdrant       | Persistent       | Preferences, patterns, facts       |

#### Memory Types

| Type       | Description                                |
|------------|--------------------------------------------|
| fact       | Objective information                      |
| preference | User choices and opinions                  |
| decision   | Choices made during conversation           |
| context    | Current conversation state                 |
| pattern    | Recurring behaviors                        |

#### Example Usage

```typescript
const result = await memoryAgent.generate(
  'Store: User prefers TypeScript for all new functions',
  {
    structuredOutput: { schema: MemoryOperationSchema }
  }
);

console.log('Operation:', result.object.operation);  // 'store'
console.log('Scope:', result.object.scope);          // 'global'
```

---

## Legacy Agents

### Vargos Agent

**File:** `apps/mastra/src/mastra/agents/vargos-agent.ts`

**Status:** Legacy (to be refactored)

**Purpose:** Original monolithic agent that handled all responsibilities before the multi-agent architecture.

**Future:** Will be deprecated and replaced by orchestrating the specialized Phase 1-3 agents.

---

## Agent Interaction Patterns

### Sequential Delegation

Agents delegate to other agents using lazy imports to avoid circular dependencies:

```typescript
// In any agent
async function delegateToCurator(request: string) {
  // Lazy import prevents circular dependency
  const { curatorAgent } = await import('./curator-agent');

  const result = await curatorAgent.generate(request, {
    structuredOutput: { schema: CuratorOutputSchema }
  });

  return result.object;
}
```

### Typical Request Flow

```
1. User Request
   ↓
2. Router Agent
   → Analyzes intent and routes
   ↓
3. Planner Agent (if complex)
   → Breaks down into steps
   ↓
4. Curator Agent (if needs search)
   → Searches existing functions
   ↓
5. Permission Agent (if needs approval)
   → Gets user consent
   ↓
6. Function Creator Agent (if creating)
   → Generates code and tests
   ↓
7. Sandbox Agent (if testing)
   → Runs tests and diagnoses
   ↓
8. Response to User
   → Structured output returned
```

### Structured Output Usage

All agents return type-safe structured output:

```typescript
// Agent returns structured output
const result = await agent.generate(prompt, {
  structuredOutput: { schema: YourSchema }
});

// Access typed output
const output: YourType = result.object;

// No need to parse JSON - already typed!
console.log(output.someField);
```

### Error Handling

Agents throw descriptive errors that bubble up:

```typescript
try {
  const result = await curatorAgent.generate('vague query');
} catch (error) {
  if (error.message.includes('needs_clarification')) {
    // Ask user for more details
  } else {
    // Handle other errors
  }
}
```

---

## Best Practices

### When Adding New Agents

1. **Single Responsibility** - Agent should have one clear purpose
2. **Structured Output** - Always define Zod schema for output
3. **Clear Instructions** - Write detailed agent prompts
4. **Tool Selection** - Only give agent necessary tools
5. **Lazy Imports** - Use lazy imports for agent delegation
6. **Memory Integration** - Use pgMemory for conversation context
7. **Documentation** - Add to this file with examples

### Agent Testing

```typescript
import { describe, it, expect } from 'vitest';
import { yourAgent } from './your-agent';

describe('YourAgent', () => {
  it('should have correct configuration', () => {
    expect(yourAgent.name).toBe('Your Agent');
    expect(yourAgent.model).toBe('openai/gpt-4o');
  });

  it('should return structured output', async () => {
    const result = await yourAgent.generate('test prompt', {
      structuredOutput: { schema: YourOutputSchema }
    });

    expect(result.object).toBeDefined();
    expect(result.object).toMatchObject({
      // Expected shape
    });
  });
});
```

### Common Pitfalls

1. **Don't use dynamic imports** - Static imports are preferred
2. **Don't skip structured output** - Always define schemas
3. **Don't ignore memory** - Use pgMemory for context
4. **Don't over-complicate** - Keep agents focused
5. **Don't forget lazy imports** - Required for agent delegation

---

## Future Roadmap

### Phase 4 Agents (Planned)

1. **Crawler Agent** - Web scraping and data extraction
2. **Dev Assistant Agent** - Code review and suggestions
3. **Evaluator Agent** - Function quality assessment
4. **Infrastructure Agent** - Deployment and monitoring

### Enhancements

- Real-time agent telemetry
- Advanced permission scoping (session-level)
- Multi-language function support
- Distributed agent orchestration
