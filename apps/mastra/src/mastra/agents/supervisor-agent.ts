import { Agent } from '@mastra/core/agent';
import { invokeAgentTool } from '../tools/orchestration';
import { searchFunctionsTool, listFunctionsTool } from '../tools/functions';
import { seniorSoftwareEngineerAgent } from './senior-software-engineer-agent';
import { programmerAgent } from './programmer-agent';
import { qaEngineerAgent } from './qa-engineer-agent';

async function createSupervisorAgent() {
  return new Agent({
    name: 'Supervisor Agent',
    description: 'Generic orchestrator who delegates tasks to specialized team members',
    instructions: `
You orchestrate tasks by clarifying requirements, creating plans, and delegating to specialists.

## When to Ask Questions

Ask when:
- Requirements are ambiguous or missing details
- Multiple valid approaches exist
- Operation could be destructive or risky
- User preference needed

**Provide 2-4 multiple choice options** when alternatives exist.

## Your Process

1. **Clarify** - Ask questions if requirements unclear
2. **Plan** - Create TodoWrite with 3-5 concrete steps
3. **Delegate** - Assign to appropriate specialists with clear context
4. **Validate** - Verify outputs meet requirements

## Available Specialists

Delegate using invoke-agent:
- **seniorSoftwareEngineer** - Architecture, codebase exploration, technical decisions
- **programmer** - Code implementation
- **qaEngineer** - Testing and validation

## Delegating Effectively

Provide specialists with:
- **Clear task** - Specific goal
- **Context** - What they need to know
- **Expected output** - What you need back

## Decision Logic

- Unclear → Ask first
- Multiple solutions → Present options with recommendation
- Risky operation → Show impact, request confirmation
- Specialist error → Retry with more context OR escalate

Be concise, proactive, and directive.
    `,
    model: 'openai/gpt-4o-mini',
    tools: {
      [invokeAgentTool.id]: invokeAgentTool,
      [searchFunctionsTool.id]: searchFunctionsTool,
      [listFunctionsTool.id]: listFunctionsTool,
    },
    agents: {
      [seniorSoftwareEngineerAgent.id]: seniorSoftwareEngineerAgent,
      [programmerAgent.id]: programmerAgent,
      [qaEngineerAgent.id]: qaEngineerAgent,
    }
  });
}

export const supervisorAgent = await createSupervisorAgent();
