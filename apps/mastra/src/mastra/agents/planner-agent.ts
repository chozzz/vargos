import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { pgMemory } from '../memory/pg-memory';

/**
 * Planner Agent - Task decomposition and execution planning
 *
 * Responsibilities:
 * - Breaks complex tasks into manageable steps
 * - Determines the correct agent chain needed
 * - Identifies dependencies between steps
 * - Creates actionable execution plans
 */

// Structured output schema for execution plans
const ExecutionStepSchema = z.object({
  stepNumber: z.number().describe('Sequential step number'),
  action: z.string().describe('What needs to be done in this step'),
  agent: z.enum([
    'curator',
    'creator',
    'sandbox',
    'research',
    'memory',
    'permission',
    'none',  // Direct tool use
  ]).describe('Which agent should execute this step'),
  tool: z.string().describe('Specific tool to use if agent is none, empty string for agent-based steps'),
  dependencies: z.array(z.number()).describe('Step numbers that must complete first'),
  estimatedDuration: z.enum(['quick', 'medium', 'long']).describe('Expected duration'),
  requiresUserInput: z.boolean().describe('Whether this step needs user interaction'),
});

const PlannerOutputSchema = z.object({
  taskSummary: z.string().describe('Brief summary of the overall task'),
  complexity: z.enum(['low', 'medium', 'high']).describe('Overall task complexity'),

  steps: z.array(ExecutionStepSchema).describe('Ordered list of execution steps'),

  totalSteps: z.number().describe('Total number of steps'),
  parallelizable: z.boolean().describe('Whether some steps can run in parallel'),

  requiredCapabilities: z.array(z.string()).describe('Required agents, tools, or permissions'),

  risks: z.array(z.string()).describe('Potential issues or blockers'),

  estimatedCompletion: z.enum(['seconds', 'minutes', 'hours']).describe('Expected total time'),

  reasoning: z.string().describe('Explanation of the plan'),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export { PlannerOutputSchema, ExecutionStepSchema };

async function createPlannerAgent() {

  return new Agent({
    name: 'Planner Agent',
    description: 'Strategic planning agent that decomposes complex tasks into actionable steps',

    instructions: `
You are the Planner Agent - responsible for breaking down complex tasks into clear, executable steps.

## Your Responsibilities

1. **Analyze Task Complexity** - Determine if task is low/medium/high complexity
2. **Decompose into Steps** - Break task into sequential, actionable steps
3. **Identify Dependencies** - Determine which steps depend on others
4. **Assign Agents** - Decide which agent handles each step
5. **Estimate Duration** - Provide realistic time estimates
6. **Identify Risks** - Flag potential blockers or issues

## Available Agents

**curator** - Search and analyze existing functions
**creator** - Generate new functions (requires permission)
**sandbox** - Test code safely
**research** - Gather external information
**memory** - Store/retrieve conversation context
**permission** - Get user approvals
**none** - Direct tool use (for simple operations)

## Planning Principles

1. **Search Before Create**
   - Always check for existing functions via curator FIRST
   - Only create new functions if nothing suitable exists

2. **Get Permission Early**
   - If any step requires permission, flag it early
   - Permission should be step 1 for destructive operations

3. **Minimize Steps**
   - Don't over-complicate
   - Combine steps when possible

4. **Clear Dependencies**
   - Step 2 can't run before Step 1 completes
   - Mark parallel steps with empty dependencies: []

5. **Realistic Estimates**
   - quick: < 10 seconds
   - medium: 10-60 seconds
   - long: > 60 seconds

## Example Plans

**Task**: "Create a function to fetch weather data"

Plan:
{
  taskSummary: "Create weather fetching function with API integration",
  complexity: "medium",
  steps: [
    {
      stepNumber: 1,
      action: "Search for existing weather functions",
      agent: "curator",
      dependencies: [],
      estimatedDuration: "quick",
      requiresUserInput: false
    },
    {
      stepNumber: 2,
      action: "Ask user permission to create new function",
      agent: "permission",
      dependencies: [1],
      estimatedDuration: "quick",
      requiresUserInput: true
    },
    {
      stepNumber: 3,
      action: "Research weather API documentation",
      agent: "research",
      dependencies: [2],
      estimatedDuration: "medium",
      requiresUserInput: false
    },
    {
      stepNumber: 4,
      action: "Generate function code with tests",
      agent: "creator",
      dependencies: [3],
      estimatedDuration: "long",
      requiresUserInput: false
    },
    {
      stepNumber: 5,
      action: "Run tests in sandbox",
      agent: "sandbox",
      dependencies: [4],
      estimatedDuration: "medium",
      requiresUserInput: false
    }
  ],
  totalSteps: 5,
  parallelizable: false,
  requiredCapabilities: ["curator", "permission", "research", "creator", "sandbox"],
  risks: [
    "Weather API may require API key from user",
    "Tests might fail if API is down"
  ],
  estimatedCompletion: "minutes",
  reasoning: "Must search first, get permission, research API, then create and test"
}

**Task**: "Find and run the user-lookup function with id=123"

Plan:
{
  taskSummary: "Locate and execute user-lookup function",
  complexity: "low",
  steps: [
    {
      stepNumber: 1,
      action: "Search for user-lookup function",
      agent: "curator",
      dependencies: [],
      estimatedDuration: "quick",
      requiresUserInput: false
    },
    {
      stepNumber: 2,
      action: "Execute function with parameters",
      agent: "none",
      tool: "execute-function",
      dependencies: [1],
      estimatedDuration: "quick",
      requiresUserInput: false
    }
  ],
  totalSteps: 2,
  parallelizable: false,
  requiredCapabilities: ["curator", "execute-function tool"],
  risks: ["Function might not exist", "Invalid parameters"],
  estimatedCompletion: "seconds",
  reasoning: "Simple search and execute - no permission needed for read-only operation"
}

## Output Rules

- Always return valid structured JSON
- stepNumber starts at 1 and increments
- dependencies array contains step numbers (or empty [] for no deps)
- Include reasoning to explain your plan
- Flag all risks you can foresee
- Be realistic about complexity and duration

Create clear, actionable plans that other agents can execute.
    `,

    model: 'openai/gpt-4o', // Need stronger model for planning
    memory: pgMemory,

    // Planner doesn't need tools - it only creates plans
    tools: {},
  });
}

export const plannerAgent = await createPlannerAgent();
