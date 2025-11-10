import { MCPClient } from "@mastra/mcp";
 
export const vargosMcpClient = new MCPClient({
  id: "vargos-mcp-client",
  servers: {
    vargos: {
      /**
       * @todo There's an issue here..
       * sometimes during `pnpm dev` on root turbo workspace,
       * the `core` MCP server may not be available yet due to race condition in dev's cold start
       */
      url: new URL(process.env.CORE_MCP_CLIENT_URL ?? "http://localhost:4861/mcp")
    },
  },
});