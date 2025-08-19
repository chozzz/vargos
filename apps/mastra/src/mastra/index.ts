
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from "@mastra/pg";

// Phase 1 Agents (Foundation)
import { routerAgent } from './agents/router-agent';
import { plannerAgent } from './agents/planner-agent';
import { curatorAgent } from './agents/curator-agent';
import { permissionAgent } from './agents/permission-agent';

// Legacy agent (to be refactored)
import { vargosAgent } from './agents/vargos-agent';

// Workflows
import { functionSearchWorkflow } from './workflows/function-search.workflow';

import { initializeCoreServices } from './services/core.service';

// Initialize all core services before creating Mastra instance
// If this fails, Mastra will not start
console.info('\n🔧 [Core] Initializing core services...');
console.info('   └─ All agents, tools, and workflows in Mastra require this');
await initializeCoreServices();
console.info('✅ [Core] Core services initialized successfully\n');

// Proxy pino logger;
const logger = new PinoLogger({
  name: 'Mastra',
  level: 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

export const mastra = new Mastra({
  bundler: {
    transpilePackages: ["@workspace/core-lib"],
    externals: ["@workspace/core-lib"],
    sourcemap: true,
  },
  server: {
    port: parseInt(process.env.MASTRA_PORT ?? '4862'),
  },

  // Phase 1: Foundation agents
  agents: {
    routerAgent,
    plannerAgent,
    curatorAgent,
    permissionAgent,
    vargosAgent, // Legacy - to be refactored
  },

  // Workflows
  workflows: {
    functionSearchWorkflow,
  },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  }),
  logger,

  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false,
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true },
  },
});
