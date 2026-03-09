/**
 * Tools service — exposes MCP tools as gateway-callable methods
 *
 * Methods: tool.execute, tool.list, tool.describe
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ServiceClient } from '../gateway/service-client.js';
import { ToolRegistry } from './registry.js';
import type { ToolContext } from './types.js';

export interface ToolsServiceConfig {
  registry: ToolRegistry;
  gatewayUrl?: string;
  /** Filesystem boundary for path validation */
  boundary?: string;
  /** Additional paths outside boundary that are permitted */
  boundaryAllowlist?: string[];
}

export class ToolsService extends ServiceClient {
  private registry: ToolRegistry;
  private boundary?: string;
  private boundaryAllowlist?: string[];

  constructor(config: ToolsServiceConfig) {
    super({
      service: 'tools',
      methods: ['tool.execute', 'tool.list', 'tool.describe'],
      events: [],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.registry = config.registry;
    this.boundary = config.boundary;
    this.boundaryAllowlist = config.boundaryAllowlist;
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'tool.list':
        return this.listTools();
      case 'tool.execute':
        return this.executeTool(params as ExecuteParams);
      case 'tool.describe':
        return this.describeTool(params as { name: string });
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(): void {
    // Tools service subscribes to nothing
  }

  private listTools() {
    return this.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema ?? zodToJsonSchema(t.parameters),
    }));
  }

  private async executeTool(params: ExecuteParams) {
    const { name, args, context } = params;

    const tool = this.registry.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const toolContext: ToolContext = {
      sessionKey: context?.sessionKey ?? 'default',
      workingDir: context?.workingDir ?? process.cwd(),
      call: <T>(target: string, method: string, p?: unknown) => this.call<T>(target, method, p),
      boundary: this.boundary,
      boundaryAllowlist: this.boundaryAllowlist,
    };

    return tool.execute(args ?? {}, toolContext);
  }

  private describeTool(params: { name: string }) {
    const tool = this.registry.get(params.name);
    if (!tool) throw new Error(`Unknown tool: ${params.name}`);

    return {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    };
  }
}

interface ExecuteParams {
  name: string;
  args?: Record<string, unknown>;
  context?: { sessionKey?: string; workingDir?: string };
}
