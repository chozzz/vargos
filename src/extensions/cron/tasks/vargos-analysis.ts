/**
 * Vargos Improvement Analysis Task
 * Hourly analysis of Vargos project for improvements
 * Spawns multiple specialized subagents
 */

import type { CronTask } from '../../../services/cron/index.js';

interface TaskAdder {
  addTask(task: Omit<CronTask, 'id'>): CronTask;
}

export interface AnalysisArea {
  name: string;
  focus: string;
  questions: string[];
}

export const ANALYSIS_AREAS: AnalysisArea[] = [
  {
    name: 'Vertical Scaling',
    focus: 'Single instance performance and resource optimization',
    questions: [
      'Analyze how Vargos handles increasing concurrent MCP connections',
      'Review memory usage patterns in session and memory services',
      'Evaluate Pi Agent Runtime for memory leaks or inefficiencies',
      'Check if file-based backends (JSONL) will bottleneck under load',
      'Recommend optimization strategies for file-based storage',
    ],
  },
  {
    name: 'Horizontal Scaling',
    focus: 'Multi-instance deployment and load distribution',
    questions: [
      'Design for running multiple Vargos instances behind a load balancer',
      'Evaluate if memory search works across instances',
      'Suggest Redis or similar for distributed state',
      'Rate limiting strategies for public MCP endpoints',
      'Multi-tenant isolation recommendations',
    ],
  },
  {
    name: 'MCP Protocol Optimization',
    focus: 'Self-hosted MCP server efficiency',
    questions: [
      'Compare stdio vs HTTP transport performance',
      'Suggest optimal transport for different use cases',
      'Analyze tool registration overhead',
      'Review JSON serialization costs',
      'Streaming vs batch response strategies',
      'Authentication patterns for public MCP servers',
    ],
  },
  {
    name: 'Code Quality & Architecture',
    focus: 'Maintainability and extensibility',
    questions: [
      'Review TypeScript strictness and type safety',
      'Check test coverage gaps',
      'Evaluate error handling consistency',
      'Suggest architectural improvements',
      'Identify code duplication or anti-patterns',
      'Review documentation completeness',
    ],
  },
  {
    name: 'Integration & Ecosystem',
    focus: 'Feature completeness and future direction',
    questions: [
      'Gap analysis: what features are missing?',
      'Priority ranking for missing features',
      'Suggest gateway implementation approach',
      'WhatsApp/Discord integration architecture',
      'Cron scheduling requirements (yes, meta!)',
      'Backup and disaster recovery',
    ],
  },
];

export function createTwiceDailyVargosAnalysis(scheduler: TaskAdder): void {
  // 09:00 AEST = 23:00 UTC (AEST is UTC+10)
  // 21:00 AEST = 11:00 UTC next day
  scheduler.addTask({
    name: 'Vargos Morning Analysis (AEST)',
    schedule: '0 23 * * *', // 09:00 AEST
    description: 'Morning analysis of Vargos project - scalability, architecture, and feature gaps',
    task: generateSuggestionTask(),
    enabled: true,
  });

  scheduler.addTask({
    name: 'Vargos Evening Analysis (AEST)',
    schedule: '0 11 * * *', // 21:00 AEST
    description: 'Evening analysis of Vargos project - review and recommendations',
    task: generateSuggestionTask(),
    enabled: true,
  });
}

export function createDailyVargosAnalysis(scheduler: TaskAdder): void {
  scheduler.addTask({
    name: 'Vargos Daily Deep Analysis',
    schedule: '0 9 * * *', // Daily at 9 AM UTC
    description: 'Deep dive analysis of Vargos with comprehensive reporting',
    task: generateDeepAnalysisTask(),
    enabled: false, // Disabled by default, enable when ready
  });
}

function generateSuggestionTask(): string {
  const areas = ANALYSIS_AREAS.map(area => `
## ${area.name}
${area.focus}

Key questions to answer:
${area.questions.map(q => `- ${q}`).join('\n')}

`).join('\n');

  return `
You are analyzing the Vargos codebase to suggest improvements to the user.

CONTEXT:
- Vargos is an open-source agentic MCP (Model Context Protocol) server
- Goal: Enable self-hosted agents that other LLMs can consume from anywhere
- User wants Vargos to eventually replace them as a programmer
- Will share repo with others - needs to be production-ready
- Runs on local machine (sandboxed) or cloud

ANALYSIS AREAS:
${areas}

## Your Job

1. **Analyze the codebase** using read, exec, memory_search tools
2. **Identify opportunities** for improvement across all 5 areas
3. **Present SUGGESTIONS** to the user in a conversational format
4. **Wait for user approval** before implementing anything

## Output Format

Create a summary report in this style:

---
## 📊 Vargos Analysis - {{TIMESTAMP}}

### 🎯 Quick Wins (Do These First)
1. **[Title]** - One sentence what it is
   - **Why**: Business/technical reason
   - **Effort**: Small/Medium/Large
   - **Impact**: High/Medium/Low

### 🚀 Strategic Improvements
[Same format for bigger items]

### ⚠️ Technical Debt
[Same format for fixes needed]

### 🤔 Questions for You
1. [Specific question about priority/direction]

---

**Store this in**: memory/vargos-suggestions/{{DATE}}.md

**Then**: Present the key suggestions conversationally and WAIT for user input.

Do NOT implement anything without explicit user approval.
`;
}

function generateDeepAnalysisTask(): string {
  return `
You are conducting a DEEP analysis of Vargos.

This is a comprehensive review that should:
1. Review git history for patterns
2. Check all TODO/FIXME comments
3. Analyze dependency tree for risks
4. Review security considerations
5. Benchmark actual performance
6. Compare with similar agentic tool servers

Output: Detailed report in memory/vargos-analysis/deep-YYYY-MM-DD.md

Include:
- Executive summary
- Detailed findings per area
- Risk matrix
- Roadmap recommendations
- Code quality metrics
`;
}

export function spawnAreaAnalysis(area: AnalysisArea, parentSessionKey: string): string {
  const task = `
You are a specialist in ${area.name}.

Focus: ${area.focus}

Analyze the Vargos codebase and answer these questions:
${area.questions.map(q => `- ${q}`).join('\n')}

Search the codebase thoroughly:
- Use memory_search for existing analyses
- Read relevant source files
- Check for performance bottlenecks
- Identify architectural issues

Output your findings to:
memory/vargos-analysis/${area.name.toLowerCase().replace(/\s+/g, '-')}-YYYY-MM-DD-HH.md

Include specific code references and line numbers where possible.
`;

  return task;
}
