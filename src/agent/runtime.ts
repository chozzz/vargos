/**
 * Unified Vargos Agent Runtime
 * Custom agent implementation (like OpenClaw) - not Pi SDK
 * Works in both CLI and MCP server modes
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { toolRegistry } from '../mcp/tools/index.js';
import { ToolContext } from '../mcp/tools/types.js';
import { getSessionService } from '../services/factory.js';
import { isSubagentSessionKey } from '../agent/prompt.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { loadPiSettings, getPiApiKey } from '../config/pi-config.js';

export interface VargosAgentConfig {
  sessionKey: string;
  workspaceDir: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  contextFiles?: Array<{ name: string; content: string }>;
  extraSystemPrompt?: string;
  userTimezone?: string;
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
}

export interface VargosAgentRunResult {
  success: boolean;
  response?: string;
  error?: string;
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>;
}

/**
 * Format tools for LangChain
 */
function formatToolsForLangChain() {
  const tools = toolRegistry.list();
  
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Create LLM client based on provider
 */
async function createLLM(config: VargosAgentConfig) {
  const provider = config.provider ?? 'openai';
  const model = config.model ?? 'gpt-4o';
  const apiKey = config.apiKey;

  switch (provider) {
    case 'openai':
      return new ChatOpenAI({
        modelName: model,
        apiKey: apiKey || process.env.OPENAI_API_KEY,
        temperature: 0.7,
      });
    
    case 'anthropic':
      return new ChatAnthropic({
        modelName: model,
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        temperature: 0.7,
      });
    
    case 'google':
      return new ChatGoogleGenerativeAI({
        model: model,
        apiKey: apiKey || process.env.GOOGLE_API_KEY,
        temperature: 0.7,
      });
    
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Vargos Agent Runtime
 * Like OpenClaw's agent - unified CLI and MCP
 */
export class VargosAgentRuntime {
  /**
   * Run an agent session
   */
  async run(config: VargosAgentConfig): Promise<VargosAgentRunResult> {
    try {
      const sessions = getSessionService();
      
      // Load existing messages from session
      const messages = await sessions.getMessages(config.sessionKey);
      
      // Build system prompt
      const systemPrompt = buildSystemPrompt({
        mode: isSubagentSessionKey(config.sessionKey) ? 'minimal' : 'full',
        workspaceDir: config.workspaceDir,
        toolNames: toolRegistry.list().map(t => t.name),
        contextFiles: config.contextFiles,
        extraSystemPrompt: config.extraSystemPrompt,
        userTimezone: config.userTimezone,
      });

      // Create LLM
      const llm = await createLLM(config);
      
      // Format tools
      const tools = formatToolsForLangChain();
      
      // Build message history
      const langchainMessages = [
        new SystemMessage(systemPrompt),
        ...messages.map(m => {
          if (m.role === 'user') return new HumanMessage(m.content);
          if (m.role === 'assistant') return new AIMessage(m.content);
          return new SystemMessage(m.content);
        }),
      ];

      // Get last user message
      const lastUserMessage = messages[messages.length - 1];
      if (!lastUserMessage || lastUserMessage.role !== 'user') {
        return {
          success: false,
          error: 'No user message to respond to',
        };
      }

      // Run agent loop (like OpenClaw)
      let iterations = 0;
      const maxIterations = 10;
      const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];
      
      while (iterations < maxIterations) {
        iterations++;
        
        // Call LLM
        const response = await llm.invoke(langchainMessages, {
          tools,
        });

        // Check if response contains tool calls
        const toolCalls_ = (response as { tool_calls?: Array<{ name: string; args: unknown }> }).tool_calls;
        
        if (!toolCalls_ || toolCalls_.length === 0) {
          // No tool calls - this is the final response
          const responseText = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);
          
          // Store in session
          await sessions.addMessage({
            sessionKey: config.sessionKey,
            content: responseText,
            role: 'assistant',
            metadata: {},
          });
          
          return {
            success: true,
            response: responseText,
            toolCalls,
          };
        }

        // Execute tool calls
        for (const toolCall of toolCalls_) {
          const toolName = toolCall.name;
          const args = toolCall.args;
          
          config.onToolCall?.(toolName, args);
          
          const tool = toolRegistry.get(toolName);
          if (!tool) {
            const errorResult = {
              content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
              isError: true,
            };
            toolCalls.push({ tool: toolName, args, result: errorResult });
            continue;
          }

          // Check subagent restrictions
          if (isSubagentSessionKey(config.sessionKey)) {
            const deniedTools = ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'];
            if (deniedTools.includes(toolName)) {
              const errorResult = {
                content: [{ type: 'text', text: `Tool '${toolName}' is not available to subagents.` }],
                isError: true,
              };
              toolCalls.push({ tool: toolName, args, result: errorResult });
              continue;
            }
          }

          // Execute tool
          const context: ToolContext = {
            sessionKey: config.sessionKey,
            workingDir: config.workspaceDir,
          };

          try {
            const result = await tool.execute(args, context);
            toolCalls.push({ tool: toolName, args, result });
            config.onToolResult?.(toolName, result);
            
            // Add tool result to message history
            langchainMessages.push(new AIMessage({
              content: '',
              tool_calls: [{ id: toolName, name: toolName, args: args as Record<string, any> }],
            }));
            langchainMessages.push(new SystemMessage(
              `Tool ${toolName} result: ${JSON.stringify(result)}`
            ));
          } catch (err) {
            const errorResult = {
              content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
            toolCalls.push({ tool: toolName, args, result: errorResult });
          }
        }
      }

      return {
        success: false,
        error: 'Max iterations reached without completion',
        toolCalls,
      };

    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Run a subagent and announce result back to parent
   */
  async runSubagent(
    config: VargosAgentConfig,
    parentSessionKey: string
  ): Promise<VargosAgentRunResult> {
    const result = await this.run(config);
    
    if (result.success) {
      const sessions = getSessionService();
      
      // Announce completion to parent
      await sessions.addMessage({
        sessionKey: parentSessionKey,
        content: `## Sub-agent Complete\n\n**Session:** ${config.sessionKey}\n**Status:** success\n\n**Result:**\n${result.response?.slice(0, 500) ?? '(no response)'}`,
        role: 'system',
        metadata: { type: 'subagent_announce', childSessionKey: config.sessionKey },
      });
    }
    
    return result;
  }
}

// Singleton instance
let globalRuntime: VargosAgentRuntime | null = null;

export function getVargosAgentRuntime(): VargosAgentRuntime {
  if (!globalRuntime) {
    globalRuntime = new VargosAgentRuntime();
  }
  return globalRuntime;
}

export function initializeVargosAgentRuntime(): VargosAgentRuntime {
  globalRuntime = new VargosAgentRuntime();
  return globalRuntime;
}
