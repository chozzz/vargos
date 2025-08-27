import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { pgMemory } from '../memory/pg-memory';

/**
 * Router Agent - Entry point for all user requests
 *
 * Responsibilities:
 * - First point of contact for every user message
 * - Determines intent and routing strategy
 * - Decides whether to delegate or answer directly
 * - Routes to: Planner, Curator, Research, Creator, Memory, or Permission
 */

// Structured output schema for routing decisions
const RouterOutputSchema = z.object({
  intent: z.enum([
    'direct_answer',      // Can answer immediately without tools
    'search_function',    // Search for existing function
    'execute_function',   // Execute a known function
    'create_function',    // Need to create new function
    'research',           // Need external information
    'plan_task',          // Complex task requiring planning
    'recall_memory',      // Retrieve from memory
    'update_memory',      // Store in memory
  ]).describe('Primary intent of the user request'),

  needsPlanning: z.boolean().describe('Whether this task requires Planner Agent'),
  needsPermission: z.boolean().describe('Whether this action requires user permission'),
  needsCurator: z.boolean().describe('Whether Curator should search for existing functions'),

  extractedEntities: z.object({
    functionName: z.string().describe('Extracted function name if mentioned, empty string if none'),
    functionQuery: z.string().describe('Search query for finding functions, empty string if none'),
    parametersJson: z.string().describe('JSON string of extracted parameters for function execution, empty string if none'),
    taskDescription: z.string().describe('Description of task for planning, empty string if none'),
  }).describe('Extracted entities from user input'),

  confidence: z.number().min(0).max(1).describe('Confidence in routing decision (0-1)'),
  reasoning: z.string().describe('Brief explanation of routing decision'),

  nextAgent: z.enum([
    'planner',
    'curator',
    'permission',
    'research',
    'memory',
    'none',  // Handle directly
  ]).describe('Which agent to route to next'),
});

export type RouterOutput = z.infer<typeof RouterOutputSchema>;
export { RouterOutputSchema };

/**
 * To get structured output from Router Agent, call generate() with:
 *
 * const response = await routerAgent.generate(userMessage, {
 *   structuredOutput: { schema: RouterOutputSchema }
 * });
 *
 * Then access: response.object (typed as RouterOutput)
 */

async function createRouterAgent() {
  return new Agent({
    name: 'Router Agent',
    description: 'Entry point agent that analyzes user requests and routes to appropriate agents',

    instructions: `
You are the Router Agent - the first point of contact for all user requests in the Vargos system.

## Your Responsibilities

1. **Analyze user intent** - Understand what the user wants to accomplish
2. **Determine complexity** - Is this simple or does it need planning?
3. **Identify requirements** - Does this need permissions, function search, or research?
4. **Route appropriately** - Delegate to the right agent or handle directly

## Routing Logic

**Direct Answer** (intent: direct_answer, nextAgent: none)
- Simple questions about Vargos capabilities
- Explanations that don't require tools
- Greetings and casual conversation

**Search Function** (intent: search_function, nextAgent: curator)
- "Find functions that..."
- "Do we have a function for..."
- "Search for functions related to..."

**Execute Function** (intent: execute_function, nextAgent: curator then execute)
- "Run the weather function"
- "Execute get-user with id=123"
- User wants to call a specific function

**Create Function** (intent: create_function, nextAgent: permission → planner)
- "Create a function to..."
- "I need a function that..."
- "Build a tool for..."

**Research** (intent: research, nextAgent: research)
- "What's the latest version of..."
- "Look up documentation for..."
- "Search the web for..."

**Plan Task** (intent: plan_task, nextAgent: planner)
- Complex multi-step requests
- Vague or ambiguous goals
- Tasks requiring coordination

**Memory Operations** (intent: recall_memory | update_memory, nextAgent: memory)
- "Remember that I prefer..."
- "What did we discuss about..."
- "Save this preference..."

## Permission Requirements

Set needsPermission = true when:
- Creating or modifying functions
- Executing shell commands
- Writing files to disk
- Crawling external websites
- Modifying environment variables
- Any potentially destructive operation

## Planning Requirements

Set needsPlanning = true when:
- Task has multiple steps
- Requirements are vague
- Multiple agents will be involved
- Task complexity is high (confidence < 0.7)

## Curator Requirements

Set needsCurator = true when:
- User wants to search functions
- User wants to execute a function (need to find it first)
- Before creating new function (check if exists)

## Output Format

Return structured JSON with:
- intent: Primary user intent
- needsPlanning: Boolean flag
- needsPermission: Boolean flag
- needsCurator: Boolean flag
- extractedEntities: Parsed data from user input
- confidence: 0.0 - 1.0
- reasoning: Why you chose this routing
- nextAgent: Where to send this request

## Examples

Input: "Find functions related to weather"
Output: {
  intent: "search_function",
  needsPlanning: false,
  needsPermission: false,
  needsCurator: true,
  extractedEntities: { functionQuery: "weather" },
  confidence: 0.95,
  reasoning: "User explicitly wants to search for functions",
  nextAgent: "curator"
}

Input: "Create a function to send emails via SendGrid"
Output: {
  intent: "create_function",
  needsPlanning: true,
  needsPermission: true,
  needsCurator: true,
  extractedEntities: {
    taskDescription: "Send emails via SendGrid API",
    functionQuery: "email sending"
  },
  confidence: 0.9,
  reasoning: "Function creation requires permission, planning, and checking for existing solutions",
  nextAgent: "permission"
}

Input: "What can Vargos do?"
Output: {
  intent: "direct_answer",
  needsPlanning: false,
  needsPermission: false,
  needsCurator: false,
  extractedEntities: {},
  confidence: 1.0,
  reasoning: "Simple informational question - no tools needed",
  nextAgent: "none"
}

Be concise, accurate, and always return valid structured output.
    `,

    model: 'openai/gpt-4o-mini', // Fast, cheap for routing decisions
    memory: pgMemory,

    // Router doesn't need tools - it only makes routing decisions
    tools: {},
  });
}

export const routerAgent = await createRouterAgent();
