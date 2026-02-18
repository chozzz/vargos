/**
 * Tools service — exposes MCP tools as gateway-callable methods
 *
 * Methods: tool.execute, tool.list, tool.describe
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { ServiceClient, type ServiceClientConfig } from '../../gateway/service-client.js';
import { ToolRegistry } from '../../tools/registry.js';
import type { Tool, ToolContext } from '../../contracts/tool.js';
import { isSubagentSessionKey, isToolAllowedForSubagent } from '../../lib/errors.js';

export interface ToolsServiceConfig {
  registry: ToolRegistry;
  gatewayUrl?: string;
}

export class ToolsService extends ServiceClient {
  private registry: ToolRegistry;

  constructor(config: ToolsServiceConfig) {
    super({
      service: 'tools',
      methods: ['tool.execute', 'tool.list', 'tool.describe'],
      events: [],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.registry = config.registry;
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
      parameters: zodToJsonSchema(t.parameters),
    }));
  }

  private async executeTool(params: ExecuteParams) {
    const { name, args, context } = params;

    const tool = this.registry.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    // Subagent restrictions
    if (context?.sessionKey && isSubagentSessionKey(context.sessionKey) && !isToolAllowedForSubagent(name)) {
      throw new Error(`Tool '${name}' is not available to subagents`);
    }

    const toolContext: ToolContext = {
      sessionKey: context?.sessionKey ?? 'default',
      workingDir: context?.workingDir ?? process.cwd(),
      // Inject gateway call capability — tools can call other services
      call: <T>(target: string, method: string, p?: unknown) => this.call<T>(target, method, p),
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
