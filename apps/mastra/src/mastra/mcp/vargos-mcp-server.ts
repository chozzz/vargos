import { MCPServer } from "@mastra/mcp";
 
import { vargosAgent } from "../agents/vargos-agent";
 
export const myMcpServer = new MCPServer({
  id: "my-mcp-server",
  name: "Vargos Mastra MCP Server",
  version: "1.0.0",
  agents: { vargosAgent },
  tools: { },
  workflows: { },
});