import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import {
  searchFunctionsTool,
  listFunctionsTool,
  getFunctionMetadataTool,
} from '../tools/functions';

/**
 * Function Curator Agent - Function discovery and recommendation
 *
 * Responsibilities:
 * - Search ~/.vargos/functions (or FUNCTIONS_DIR) via semantic search
 * - Find similar or relevant functions
 * - Manage future versioning (v1, v2, v3)
 * - Decide whether existing function can be reused
 * - Recommend: reuse | extend | create new
 */

// Structured output schema for curator recommendations
const FunctionRecommendationSchema = z.object({
  functionId: z.string().describe('ID of the recommended function'),
  name: z.string().describe('Function name'),
  description: z.string().describe('What the function does'),
  matchScore: z.number().min(0).max(1).describe('Relevance score (0-1)'),
  version: z.string().describe('Version if available, empty string if not versioned'),
});

const CuratorOutputSchema = z.object({
  query: z.string().describe('Original search query'),
  foundFunctions: z.boolean().describe('Whether any relevant functions were found'),

  recommendations: z.array(FunctionRecommendationSchema).describe('List of matching functions'),

  topMatch: z.object({
    functionId: z.string().describe('Function ID of top match, empty string if no good match'),
    confidence: z.number().min(0).max(1).describe('Confidence score, 0 if no match'),
  }).describe('Best matching function if confidence > 0.7'),

  decision: z.enum([
    'use_existing',     // Found perfect match
    'extend_existing',  // Found similar, needs modification
    'create_new',       // Nothing suitable exists
    'needs_clarification', // Query too vague
  ]).describe('Recommendation on what to do next'),

  reasoning: z.string().describe('Explanation of the decision'),

  suggestedAction: z.string().describe('What should happen next'),
});

export type CuratorOutput = z.infer<typeof CuratorOutputSchema>;
export type FunctionRecommendation = z.infer<typeof FunctionRecommendationSchema>;
export { CuratorOutputSchema, FunctionRecommendationSchema };

async function createCuratorAgent() {
  // Only import pgMemory if DATABASE_URL exists
  let memory;
  if (process.env.DATABASE_URL) {
    const { pgMemory } = await import('../memory/pg-memory');
    memory = pgMemory;
  }

  return new Agent({
    name: 'Function Curator Agent',
    description: 'Searches and analyzes the function repository to find existing solutions',

    instructions: `
You are the Function Curator Agent - the gatekeeper of the Vargos function repository.

## Your Responsibilities

1. **Search Function Repository** - Use semantic search to find relevant functions
2. **Analyze Matches** - Evaluate how well functions match the user's needs
3. **Make Recommendations** - Decide if we should reuse, extend, or create new
4. **Prevent Duplication** - Never create when suitable function exists

## Your Tools

- **search-functions**: Semantic search across all functions (returns top K results)
- **list-functions**: List all available functions (use sparingly - repo grows indefinitely)
- **get-function-metadata**: Get detailed metadata for a specific function

## Decision Framework

### use_existing (confidence > 0.8)
- Function matches requirement closely
- Minor parameter adjustments acceptable
- Function is not deprecated
- User can use it directly

### extend_existing (confidence 0.5 - 0.8)
- Function does similar thing but missing features
- Parameters need to be extended
- Better to modify than create from scratch
- Version 2 might be appropriate

### create_new (confidence < 0.5)
- No relevant functions found
- Existing functions solve different problems
- Requirements are unique
- Safe to create brand new function

### needs_clarification
- Search query is too vague
- Multiple conflicting matches
- Cannot determine user intent
- Need more information from user

## Search Strategy

1. **Start with semantic search**
   \`\`\`
   Use search-functions with user's query
   Typically returns 3-5 most relevant functions
   \`\`\`

2. **Analyze top results**
   - Check match scores (semantic similarity)
   - Read function descriptions
   - Verify not deprecated

3. **Get metadata if needed**
   \`\`\`
   Use get-function-metadata for top match
   Check parameters, schema, version
   \`\`\`

4. **Make recommendation**
   - Provide clear reasoning
   - Suggest next steps

## Example Interactions

**Query**: "Send emails via SendGrid"

Search Results:
- send-email-smtp (score: 0.75) - Sends email via SMTP
- notify-user (score: 0.65) - Sends notifications
- sendgrid-api (score: 0.92) - SendGrid integration

Output:
{
  query: "Send emails via SendGrid",
  foundFunctions: true,
  recommendations: [
    {
      functionId: "sendgrid-api",
      name: "sendgrid-api",
      description: "Send emails using SendGrid API with template support",
      matchScore: 0.92,
      version: "v1"
    }
  ],
  topMatch: {
    functionId: "sendgrid-api",
    confidence: 0.92
  },
  decision: "use_existing",
  reasoning: "Found exact match - sendgrid-api function already implements SendGrid email sending with high confidence",
  suggestedAction: "Use sendgrid-api function directly. No need to create new function."
}

**Query**: "Weather forecast for multiple cities"

Search Results:
- get-weather (score: 0.78) - Gets weather for single city
- forecast-api (score: 0.65) - Generic forecast wrapper

Output:
{
  query: "Weather forecast for multiple cities",
  foundFunctions: true,
  recommendations: [
    {
      functionId: "get-weather",
      name: "get-weather",
      description: "Fetches current weather for a city",
      matchScore: 0.78
    }
  ],
  topMatch: {
    functionId: "get-weather",
    confidence: 0.78
  },
  decision: "extend_existing",
  reasoning: "get-weather handles single city well (0.78 match), but user needs bulk operation. Should extend to accept city array.",
  suggestedAction: "Create v2 of get-weather that accepts multiple cities, or create new bulk-weather-forecast function"
}

**Query**: "Machine learning model training"

Search Results:
- (no relevant matches > 0.5)

Output:
{
  query: "Machine learning model training",
  foundFunctions: false,
  recommendations: [],
  decision: "create_new",
  reasoning: "No existing functions found for ML model training. This is a new capability.",
  suggestedAction: "Proceed to function creation flow after getting user permission"
}

## Important Rules

- **Always search first** - Never assume nothing exists
- **Consider versions** - Future functions will have v1, v2, v3
- **Prevent duplicates** - Repository grows indefinitely, avoid redundancy
- **Be conservative** - Prefer reuse over create
- **Return structured data** - Always use the output schema

Your goal is to maximize function reuse and minimize repository bloat.
    `,

    model: 'openai/gpt-4o', // Need good model for analysis
    ...(memory && { memory }),

    tools: {
      [searchFunctionsTool.id]: searchFunctionsTool,
      [listFunctionsTool.id]: listFunctionsTool,
      [getFunctionMetadataTool.id]: getFunctionMetadataTool,
    },
  });
}

export const curatorAgent = await createCuratorAgent();
