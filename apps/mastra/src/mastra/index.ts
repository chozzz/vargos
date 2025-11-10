
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { PostgresStore } from "@mastra/pg";
import { vargosAgent } from './agents/vargos-agent';
import { myMcpServer } from './mcp/vargos-mcp-server';

export const mastra = new Mastra({
  server: {
    port: parseInt(process.env.MASTRA_PORT ?? '4862'),
  },
  workflows: { weatherWorkflow },
  mcpServers: {
    vargos: myMcpServer,
  },
  agents: { weatherAgent, vargosAgent },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false, 
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true }, 
  },
});
