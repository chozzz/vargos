/**
 * Vargos Improvement Analysis Task
 * Hourly analysis of Vargos project for improvements
 * Spawns multiple specialized subagents
 */

import { CronScheduler } from '../scheduler.js';

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
      'Suggest when users should switch to Postgres/Qdrant',
      'Recommend connection pooling strategies',
    ],
  },
  {
    name: 'Horizontal Scaling',
    focus: 'Multi-instance deployment and load distribution',
    questions: [
      'Design for running multiple Vargos instances behind a load balancer',
      'Ensure session statelessness for shared storage (Postgres)',
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
    focus: 'OpenClaw parity and future features',
    questions: [
      'Gap analysis: what OpenClaw features are missing?',
      'Priority ranking for missing features',
      'Suggest gateway implementation approach',
      'WhatsApp/Discord integration architecture',
      'Cron scheduling requirements (yes, meta!)',
      'Backup and disaster recovery',
    ],
  },
];

export function createHourlyVargosAnalysis(scheduler: CronScheduler): void {
  scheduler.addTask({
    name: 'Vargos Hourly Analysis',
    schedule: '0 * * * *', // Every hour
    description: 'Comprehensive analysis of Vargos project for improvements across scaling, architecture, and features',
    task: generateMasterTask(),
    enabled: true,
  });
}

export function createDailyVargosAnalysis(scheduler: CronScheduler): void {
  scheduler.addTask({
    name: 'Vargos Daily Deep Analysis',
    schedule: '0 9 * * *', // Daily at 9 AM UTC
    description: 'Deep dive analysis of Vargos with comprehensive reporting',
    task: generateDeepAnalysisTask(),
    enabled: false, // Disabled by default, enable when ready
  });
}

function generateMasterTask(): string {
  const areas = ANALYSIS_AREAS.map(area => `
## ${area.name}
${area.focus}

Key questions to answer:
${area.questions.map(q => `- ${q}`).join('\n')}

`).join('\n');

  return `
You are the Vargos Master Analysis Orchestrator.

Your job: Analyze the Vargos codebase across 5 critical areas and SUGGEST IMPROVEMENTS.

Vargos is an open-source alternatiive to OpenClaw, focused on MCP (Model Context Protocol) 
self-hosting. It allows LLMs to connect to a personal agent server via stdio or HTTP.

${areas}

## Your Output Format

For each area, provide:
1. **Current State**: Brief assessment
2. **Issues Found**: Specific problems or risks
3. **Recommendations**: Concrete, actionable improvements
4. **Priority**: High/Medium/Low
5. **Effort**: Small/Medium/Large

## Final Output

Store your analysis in the memory system:
- File: memory/vargos-analysis/YYYY-MM-DD-HH.md
- Include timestamp and summary
- Tag with #vargos-improvement

Then SPAWN 5 specialized subagents (one per area) for deeper analysis.
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
6. Compare with OpenClaw architecture

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
