# Vargos Functions Repository Design

This document describes the design, structure, and lifecycle of the Vargos function repository - a versioned, searchable collection of executable TypeScript functions.

## Table of Contents

- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Function Metadata](#function-metadata)
- [Function Lifecycle](#function-lifecycle)
- [Versioning](#versioning)
- [Semantic Search](#semantic-search)
- [Function Execution](#function-execution)
- [Testing Strategy](#testing-strategy)
- [Best Practices](#best-practices)

## Overview

The Vargos function repository is an external collection of reusable, executable functions stored in a standardized directory structure. Functions are:

- **Versioned** - Semantic versioning (v1, v2, v3, etc.)
- **Searchable** - Semantic search via embeddings
- **Testable** - Each function includes vitest tests
- **Documented** - Rich metadata with inputs, outputs, env vars
- **Isolated** - Run in subprocess for safety

### Repository Location

Default: `~/.vargos/functions/src/`

Configurable via `FUNCTIONS_DIR` environment variable:

```bash
FUNCTIONS_DIR=/path/to/functions
```

### External Repository

The function repository is cloned from an external template:

**Template Repository:** [github.com/chozzz/vargos-functions-template](https://github.com/chozzz/vargos-functions-template)

**Purpose:**
- Provides starter functions
- Defines function structure conventions
- Allows sharing functions across installations
- Community-contributed functions (future)

## Repository Structure

### Directory Layout

```
~/.vargos/functions/
├── src/                           # Function source code
│   ├── communication/             # Category
│   │   ├── send-email-smtp/       # Function name
│   │   │   └── v1/                # Version
│   │   │       ├── index.ts       # Implementation
│   │   │       ├── send-email-smtp.meta.json  # Metadata
│   │   │       └── send-email-smtp.test.ts    # Tests
│   │   └── send-email-sendgrid/
│   │       ├── v1/
│   │       └── v2/                # Version 2 (breaking changes)
│   │
│   ├── data/                      # Category
│   │   ├── fetch-weather/
│   │   │   └── v1/
│   │   └── parse-csv/
│   │       ├── v1/
│   │       └── v2/
│   │
│   ├── utils/                     # Category
│   │   ├── format-date/
│   │   │   └── v1/
│   │   └── validate-email/
│   │       └── v1/
│   │
│   └── [more categories]/
│
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── vitest.config.ts               # Test configuration
```

### Category Organization

Functions are grouped by category for easy discovery:

| Category        | Purpose                                  |
|-----------------|------------------------------------------|
| communication   | Email, SMS, notifications                |
| data            | Data fetching, parsing, transformation   |
| utils           | Utilities, formatting, validation        |
| api             | API integrations (Stripe, Twilio, etc.) |
| automation      | Workflow automation, scheduling          |
| analytics       | Data analysis, reporting                 |

**Flexible Categories:**
- Functions can belong to multiple categories (array in metadata)
- Categories are searchable
- No rigid category hierarchy

### Version Directories

Each function can have multiple versions:

```
send-email-sendgrid/
├── v1/      # Version 1.0.0 (original)
├── v2/      # Version 2.0.0 (breaking changes)
└── v3/      # Version 3.0.0 (major rewrite)
```

**Version Selection:**
- Default: Latest version (highest number)
- Can specify version: `send-email-sendgrid@v1`
- Curator agent recommends latest stable version

## Function Metadata

Each function has a `.meta.json` file with comprehensive metadata.

### Metadata Schema

**File:** `function-name.meta.json`

```json
{
  "id": "send-email-sendgrid",
  "name": "send-email-sendgrid",
  "description": "Send emails using SendGrid API with template support",
  "version": "1.0.0",
  "category": "communication",
  "tags": ["email", "sendgrid", "notification", "api"],
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
    },
    {
      "name": "templateId",
      "type": "string",
      "description": "SendGrid template ID (optional)",
      "defaultValue": ""
    }
  ],
  "output": [
    {
      "name": "messageId",
      "type": "string",
      "description": "SendGrid message ID for tracking"
    },
    {
      "name": "success",
      "type": "boolean",
      "description": "Whether email was sent successfully"
    }
  ],
  "author": "Vargos Team",
  "license": "MIT",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

### Metadata Fields

| Field            | Type                | Required | Description                            |
|------------------|---------------------|----------|----------------------------------------|
| id               | string              | Yes      | Unique function identifier             |
| name             | string              | Yes      | Function name (kebab-case)             |
| description      | string              | Yes      | What the function does                 |
| version          | string              | Yes      | Semantic version (1.0.0)               |
| category         | string or string[]  | Yes      | Category or categories                 |
| tags             | string[]            | Yes      | Searchable tags                        |
| requiredEnvVars  | string[]            | Yes      | Required environment variables         |
| input            | InputSchema[]       | Yes      | Input parameters schema                |
| output           | OutputSchema[]      | Yes      | Output schema                          |
| author           | string              | No       | Function author                        |
| license          | string              | No       | License (default: MIT)                 |
| createdAt        | string (ISO)        | No       | Creation timestamp                     |
| updatedAt        | string (ISO)        | No       | Last update timestamp                  |

### Input Schema

```typescript
interface InputParameter {
  name: string;           // Parameter name
  type: string;           // TypeScript type (string, number, boolean, object, etc.)
  description: string;    // What this parameter does
  defaultValue?: string;  // Default value (optional)
  required?: boolean;     // Whether required (default: true)
}
```

### Output Schema

```typescript
interface OutputField {
  name: string;           // Field name
  type: string;           // TypeScript type
  description?: string;   // What this field represents
}
```

## Function Lifecycle

### 1. Creation

Functions are created via Function Creator Agent or manually.

**Agent Creation:**
```typescript
const result = await functionCreatorAgent.generate(
  'Create a function to send emails via SendGrid',
  {
    structuredOutput: { schema: FunctionGenerationSchema }
  }
);

// Agent generates:
// - TypeScript code (index.ts)
// - Tests (function-name.test.ts)
// - Metadata (function-name.meta.json)

await createFunctionTool.execute({
  context: {
    name: result.object.name,
    code: result.object.code,
    tests: result.object.tests,
    metadata: { /* ... */ },
  }
});
```

**Manual Creation:**
```bash
# Create directory structure
mkdir -p ~/.vargos/functions/src/communication/send-email/v1

# Create files
touch index.ts
touch send-email.meta.json
touch send-email.test.ts
```

### 2. Indexing

After creation, functions are indexed for semantic search:

```typescript
// Automatic indexing
await functionsService.indexFunctions();

// What happens:
// 1. Scan repository for .meta.json files
// 2. Generate embeddings for descriptions
// 3. Store in Qdrant vector database
// 4. Make searchable
```

**Index Structure:**
```typescript
{
  id: 'send-email-sendgrid',
  vector: [0.123, -0.456, ...],  // 1536-dimensional embedding
  payload: {
    name: 'send-email-sendgrid',
    description: 'Send emails using SendGrid API...',
    category: 'communication',
    tags: ['email', 'sendgrid', 'notification'],
  }
}
```

### 3. Discovery

Users discover functions via Curator Agent:

```typescript
const result = await curatorAgent.generate(
  'Find functions that send emails',
  {
    structuredOutput: { schema: CuratorOutputSchema }
  }
);

// Curator uses searchFunctionsTool
// → FunctionsService.searchFunctions()
// → VectorService.search()
// → Qdrant semantic search
```

**Search Flow:**
```
User Query
  ↓
Curator Agent
  ↓
searchFunctionsTool
  ↓
FunctionsService.searchFunctions()
  ↓
LLMService.getEmbedding(query)  # Generate query embedding
  ↓
VectorService.search(embedding)  # Search Qdrant
  ↓
Ranked Results (by similarity score)
```

### 4. Execution

Functions execute in isolated subprocess:

```typescript
const result = await executeFunctionTool.execute({
  context: {
    functionId: 'send-email-sendgrid',
    input: {
      to: 'user@example.com',
      subject: 'Test Email',
      content: 'Hello from Vargos!',
    }
  }
});

// Execution:
// 1. Validate input against metadata schema
// 2. Check required environment variables
// 3. Spawn subprocess: pnpm tsx index.ts
// 4. Pass input via stdin
// 5. Capture output from stdout
// 6. Return structured result
```

**Subprocess Isolation:**
- Each execution runs in separate process
- Failures don't crash main process
- Timeout protection (default: 30 seconds)
- Memory limits (future)

### 5. Testing

Functions are tested via Sandbox Agent:

```typescript
const result = await sandboxAgent.generate(
  'Test function: send-email-sendgrid',
  {
    structuredOutput: { schema: TestAnalysisSchema }
  }
);

// Sandbox uses testFunctionTool
// → FunctionsService.testFunction()
// → Spawn: pnpm vitest run
// → Parse test output
// → Diagnose failures
```

**Test Execution:**
```bash
# Inside function directory
cd ~/.vargos/functions/src/communication/send-email-sendgrid/v1

# Run tests
pnpm vitest run send-email-sendgrid.test.ts

# Output parsed by Sandbox Agent
```

### 6. Versioning

When breaking changes occur, create new version:

```bash
# Copy v1 to v2
cp -r send-email-sendgrid/v1 send-email-sendgrid/v2

# Update metadata
# - Increment version: 1.0.0 → 2.0.0
# - Update description with changes
# - Modify input/output schemas

# Implement breaking changes in v2/index.ts

# Both versions coexist:
# - send-email-sendgrid@v1 (old behavior)
# - send-email-sendgrid@v2 (new behavior)
```

## Versioning

### Semantic Versioning

Functions use semantic versioning (MAJOR.MINOR.PATCH):

```
MAJOR: Breaking changes (e.g., 1.x.x → 2.0.0)
MINOR: New features, backward compatible (e.g., 1.0.x → 1.1.0)
PATCH: Bug fixes (e.g., 1.0.0 → 1.0.1)
```

### Version Directories

Physical versions stored as directories:

```
function-name/
├── v1/    # Version 1.x.x
│   └── function-name.meta.json: { "version": "1.0.0" }
├── v2/    # Version 2.x.x
│   └── function-name.meta.json: { "version": "2.0.0" }
└── v3/    # Version 3.x.x
    └── function-name.meta.json: { "version": "3.0.0" }
```

### Version Selection

**Default Behavior:**
```typescript
// Uses latest version (highest number)
await executeFunctionTool.execute({
  context: {
    functionId: 'send-email-sendgrid',  // → v3 (latest)
    input: { /* ... */ }
  }
});
```

**Explicit Version:**
```typescript
// Specify version
await executeFunctionTool.execute({
  context: {
    functionId: 'send-email-sendgrid@v1',  // → v1 explicitly
    input: { /* ... */ }
  }
});
```

### Breaking Changes

**When to create new major version:**
- Changed input/output schema
- Removed parameters
- Different return type
- Different behavior with same inputs

**Example:**
```typescript
// v1: Sends plain text email
{
  "input": [
    { "name": "to", "type": "string" },
    { "name": "subject", "type": "string" },
    { "name": "content", "type": "string" }
  ]
}

// v2: Supports templates (breaking: content now optional)
{
  "input": [
    { "name": "to", "type": "string" },
    { "name": "subject", "type": "string" },
    { "name": "content", "type": "string", "required": false },
    { "name": "templateId", "type": "string", "required": false }
  ]
}
```

### Deprecation

Mark old versions as deprecated in metadata:

```json
{
  "version": "1.0.0",
  "deprecated": true,
  "deprecationReason": "Replaced by v2 with template support",
  "migrationGuide": "Use templateId parameter instead of raw content"
}
```

Curator Agent will:
- Warn about deprecated functions
- Suggest newer versions
- Provide migration guidance

## Semantic Search

Functions are searchable via vector embeddings.

### Indexing Process

**1. Extract Metadata:**
```typescript
// For each function in repository
const metadata = await readMetadata('function-name.meta.json');
```

**2. Generate Embedding:**
```typescript
// Combine description + tags for embedding
const text = `${metadata.description} ${metadata.tags.join(' ')}`;
const embedding = await llmService.getEmbedding(text);
```

**3. Store in Qdrant:**
```typescript
await vectorService.upsert([
  {
    id: metadata.id,
    vector: embedding,  // 1536 dimensions
    payload: {
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      tags: metadata.tags,
    }
  }
]);
```

### Search Process

**1. User Query:**
```typescript
const query = 'send emails via SendGrid';
```

**2. Generate Query Embedding:**
```typescript
const queryEmbedding = await llmService.getEmbedding(query);
```

**3. Vector Similarity Search:**
```typescript
const results = await vectorService.search(queryEmbedding, 5);

// Returns top 5 most similar functions
// Sorted by cosine similarity score (0-1)
```

**4. Rank Results:**
```typescript
results.forEach(result => {
  console.log(`${result.payload.name} (score: ${result.score})`);
});

// Output:
// send-email-sendgrid (score: 0.92)
// send-email-smtp (score: 0.78)
// notify-user (score: 0.65)
```

### Search Quality

**High-quality matches (score > 0.8):**
- Exact semantic match
- Use function directly

**Medium-quality matches (score 0.5-0.8):**
- Similar but not perfect
- Consider extending or creating new

**Low-quality matches (score < 0.5):**
- Not relevant
- Create new function

### Improving Search

**Better Descriptions:**
```json
// ❌ Bad - too vague
{
  "description": "Send email"
}

// ✅ Good - specific and descriptive
{
  "description": "Send emails using SendGrid API with template support, attachment handling, and delivery tracking"
}
```

**Better Tags:**
```json
// ❌ Bad - generic
{
  "tags": ["email"]
}

// ✅ Good - specific and varied
{
  "tags": ["email", "sendgrid", "notification", "template", "api", "communication"]
}
```

## Function Execution

Functions execute in isolated subprocess for safety.

### Execution Flow

```
1. Validate Input
   ↓
2. Check Environment Variables
   ↓
3. Spawn Subprocess
   ↓
4. Pass Input via stdin
   ↓
5. Capture Output from stdout
   ↓
6. Parse Result
   ↓
7. Return Structured Output
```

### Implementation Example

**Function Code (index.ts):**
```typescript
export interface FunctionInput {
  to: string;
  subject: string;
  content: string;
}

export interface FunctionOutput {
  messageId: string;
  success: boolean;
}

export async function execute(input: FunctionInput): Promise<FunctionOutput> {
  // 1. Validate environment variables
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY environment variable is required');
  }

  // 2. Validate input
  if (!input.to || !input.subject || !input.content) {
    throw new Error('Missing required fields: to, subject, content');
  }

  // 3. Execute logic
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: 'noreply@example.com' },
        subject: input.subject,
        content: [{ type: 'text/html', value: input.content }],
      }),
    });

    if (!response.ok) {
      throw new Error(`SendGrid API error: ${response.statusText}`);
    }

    const messageId = response.headers.get('X-Message-Id') || 'unknown';

    return {
      messageId,
      success: true,
    };
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// Entry point for subprocess execution
if (require.main === module) {
  const input = JSON.parse(process.argv[2]);
  execute(input)
    .then(output => {
      console.log(JSON.stringify(output));
      process.exit(0);
    })
    .catch(error => {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    });
}
```

### Subprocess Execution

**Command:**
```bash
cd ~/.vargos/functions/src/communication/send-email-sendgrid/v1
pnpm tsx index.ts '{"to":"user@example.com","subject":"Test","content":"Hello"}'
```

**Output Parsing:**
```typescript
// Success
{
  "messageId": "abc123",
  "success": true
}

// Error
{
  "error": "SENDGRID_API_KEY environment variable is required"
}
```

### Timeout Protection

Functions have execution timeout (default: 30 seconds):

```typescript
const timeout = 30000;  // 30 seconds

const result = await Promise.race([
  executeFunctionSubprocess(functionId, input),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Execution timeout')), timeout)
  )
]);
```

## Testing Strategy

Each function includes comprehensive vitest tests.

### Test File Structure

**File:** `function-name.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { execute, FunctionInput, FunctionOutput } from './index';

describe('send-email-sendgrid', () => {
  beforeAll(() => {
    // Check required environment variables
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY required for tests');
    }
  });

  describe('valid inputs', () => {
    it('should send email successfully', async () => {
      const input: FunctionInput = {
        to: 'test@example.com',
        subject: 'Test Email',
        content: 'This is a test email',
      };

      const output: FunctionOutput = await execute(input);

      expect(output.success).toBe(true);
      expect(output.messageId).toBeDefined();
      expect(output.messageId).not.toBe('unknown');
    });

    it('should handle HTML content', async () => {
      const input: FunctionInput = {
        to: 'test@example.com',
        subject: 'HTML Email',
        content: '<h1>Hello</h1><p>This is HTML</p>',
      };

      const output = await execute(input);

      expect(output.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should throw error for missing recipient', async () => {
      const input = {
        to: '',
        subject: 'Test',
        content: 'Test',
      };

      await expect(execute(input)).rejects.toThrow('Missing required fields');
    });

    it('should throw error for missing subject', async () => {
      const input = {
        to: 'test@example.com',
        subject: '',
        content: 'Test',
      };

      await expect(execute(input)).rejects.toThrow('Missing required fields');
    });
  });

  describe('environment variables', () => {
    it('should throw error if SENDGRID_API_KEY is missing', async () => {
      const originalKey = process.env.SENDGRID_API_KEY;
      delete process.env.SENDGRID_API_KEY;

      const input: FunctionInput = {
        to: 'test@example.com',
        subject: 'Test',
        content: 'Test',
      };

      await expect(execute(input)).rejects.toThrow('SENDGRID_API_KEY');

      // Restore
      process.env.SENDGRID_API_KEY = originalKey;
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in subject', async () => {
      const input: FunctionInput = {
        to: 'test@example.com',
        subject: 'Test with émojis 🚀 and spëcial çharacters',
        content: 'Test',
      };

      const output = await execute(input);

      expect(output.success).toBe(true);
    });

    it('should handle long content', async () => {
      const longContent = 'a'.repeat(10000);

      const input: FunctionInput = {
        to: 'test@example.com',
        subject: 'Long Content Test',
        content: longContent,
      };

      const output = await execute(input);

      expect(output.success).toBe(true);
    });
  });
});
```

### Test Coverage

Aim for comprehensive coverage:

1. **Valid Inputs** - Normal usage scenarios
2. **Invalid Inputs** - Missing/malformed parameters
3. **Environment Variables** - Missing or invalid env vars
4. **Edge Cases** - Boundary conditions, special characters
5. **Error Handling** - External API failures, timeouts

### Running Tests

**Via Sandbox Agent:**
```typescript
const result = await sandboxAgent.generate(
  'Test function: send-email-sendgrid',
  {
    structuredOutput: { schema: TestAnalysisSchema }
  }
);

console.log('Passed:', result.object.passed);
console.log('Total:', result.object.testResults.total);
console.log('Failed:', result.object.testResults.failed);
```

**Manually:**
```bash
cd ~/.vargos/functions/src/communication/send-email-sendgrid/v1
pnpm vitest run send-email-sendgrid.test.ts
```

## Best Practices

### Function Design

1. **Single Responsibility** - One function, one purpose
2. **Clear Naming** - Use kebab-case, descriptive names
3. **Type Safety** - Define interfaces for inputs/outputs
4. **Error Handling** - Throw descriptive errors
5. **Documentation** - JSDoc comments for complex logic

### Metadata Quality

1. **Detailed Descriptions** - Explain what, why, and how
2. **Comprehensive Tags** - Include all relevant keywords
3. **Accurate Categories** - Choose appropriate category
4. **Complete Schemas** - Document all inputs and outputs
5. **Environment Variables** - List ALL required env vars

### Testing

1. **Test-Driven** - Write tests first
2. **Comprehensive Coverage** - Valid, invalid, edge cases
3. **Realistic Tests** - Test actual behavior, not mocks
4. **Environment Checks** - Verify required env vars exist
5. **Cleanup** - Restore state after tests

### Versioning

1. **Semantic Versioning** - Follow MAJOR.MINOR.PATCH
2. **Breaking Changes** - Always create new major version
3. **Deprecation** - Mark old versions as deprecated
4. **Migration Guides** - Explain how to upgrade

### Performance

1. **Timeouts** - Handle long-running operations gracefully
2. **Resource Limits** - Don't consume excessive memory
3. **Async/Await** - Use modern async patterns
4. **Error Recovery** - Retry transient failures

---

## Example: Complete Function

Here's a complete example of a well-designed function:

### Directory Structure

```
~/.vargos/functions/src/communication/send-email-sendgrid/v1/
├── index.ts
├── send-email-sendgrid.meta.json
└── send-email-sendgrid.test.ts
```

### Metadata (send-email-sendgrid.meta.json)

```json
{
  "id": "send-email-sendgrid",
  "name": "send-email-sendgrid",
  "description": "Send emails using SendGrid API with template support, attachment handling, and delivery tracking. Supports both plain text and HTML content.",
  "version": "1.0.0",
  "category": "communication",
  "tags": ["email", "sendgrid", "notification", "template", "api", "communication"],
  "requiredEnvVars": ["SENDGRID_API_KEY"],
  "input": [
    {
      "name": "to",
      "type": "string",
      "description": "Recipient email address",
      "required": true
    },
    {
      "name": "subject",
      "type": "string",
      "description": "Email subject line",
      "required": true
    },
    {
      "name": "content",
      "type": "string",
      "description": "Email body content (plain text or HTML)",
      "required": true
    },
    {
      "name": "templateId",
      "type": "string",
      "description": "SendGrid template ID (optional)",
      "required": false,
      "defaultValue": ""
    }
  ],
  "output": [
    {
      "name": "messageId",
      "type": "string",
      "description": "SendGrid message ID for tracking"
    },
    {
      "name": "success",
      "type": "boolean",
      "description": "Whether email was sent successfully"
    }
  ],
  "author": "Vargos Team",
  "license": "MIT",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

This comprehensive function repository design provides:
- Clear structure and organization
- Rich metadata for discovery
- Semantic search capabilities
- Safe execution in subprocess
- Comprehensive testing
- Versioning support

The repository scales indefinitely while maintaining discoverability through semantic search and RAG-first approach.
