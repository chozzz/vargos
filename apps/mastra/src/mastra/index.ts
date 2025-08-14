
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows/weather-workflow';
import { curateFunctionWorkflow } from './workflows/curate-function-workflow';
import { weatherAgent } from './agents/weather-agent';
import { PostgresStore } from "@mastra/pg";
import { vargosAgent } from './agents/vargos-agent';
import { functionCuratorAgent } from './agents/function-curator-agent';
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
  server: {
    port: parseInt(process.env.MASTRA_PORT ?? '4862'),
  },
  workflows: {
    weatherWorkflow,
    curateFunctionWorkflow,
  },
  agents: { weatherAgent, vargosAgent, functionCuratorAgent },
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
