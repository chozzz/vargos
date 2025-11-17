/**
 * Unified Vargos Agent Runtime
 * Custom agent implementation (like OpenClaw) - not Pi SDK
 * Works in both CLI and MCP server modes
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolContext } from '../mcp/tools/types.js';
import { getSessionService } from '../services/factory.js';
import { isSubagentSessionKey, isToolAllowedForSubagent, formatErrorResult } from '../utils/errors.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import type { ToolCall } from '@langchain/core/messages';

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
async function formatToolsForLangChain() {
  // Lazy import to avoid circular dependency
  const { toolRegistry } = await import('../mcp/tools/registry.js');
  const tools = toolRegistry.list();
  
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    },
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
      const { toolRegistry } = await import('../mcp/tools/registry.js');
      const systemPrompt = buildSystemPrompt({
        mode: isSubagentSessionKey(config.sessionKey) ? 'minimal' : 'full',
        workspaceDir: config.workspaceDir,
        toolNames: toolRegistry.list().map((t: { name: string }) => t.name),
        contextFiles: config.contextFiles,
        extraSystemPrompt: config.extraSystemPrompt,
        userTimezone: config.userTimezone,
      });

      // Create LLM
      const llm = await createLLM(config);
      
      // Format tools
      const tools = await formatToolsForLangChain();
      
      // Build message history
      const langchainMessages: (HumanMessage | SystemMessage | AIMessage | ToolMessage)[] = [
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
        
        // Call LLM with tools
        const response = await llm.invoke(langchainMessages, { tools });

        // Check if response contains tool calls
        const aiMessage = response as AIMessage;
        const responseToolCalls = aiMessage.tool_calls;
        
        if (!responseToolCalls || responseToolCalls.length === 0) {
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

        // Add AI message with tool calls to history
        langchainMessages.push(aiMessage);

        // Execute tool calls
        for (const toolCall of responseToolCalls) {
          const toolName = toolCall.name;
          const args = toolCall.args;
          const toolCallId = toolCall.id || toolName;
          
          config.onToolCall?.(toolName, args);
          
          // Lazy import to avoid circular dependency
          const { toolRegistry } = await import('../mcp/tools/registry.js');
          const tool = toolRegistry.get(toolName);
          if (!tool) {
            const errorResult = formatErrorResult(`Unknown tool: ${toolName}`);
            toolCalls.push({ tool: toolName, args, result: errorResult });
            
            langchainMessages.push(new ToolMessage({
              content: errorResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n'),
              tool_call_id: toolCallId,
            }));
            continue;
          }

          // Check subagent restrictions
          if (isSubagentSessionKey(config.sessionKey) && !isToolAllowedForSubagent(toolName)) {
            const errorResult = formatErrorResult(`Tool '${toolName}' is not available to subagents.`);
            toolCalls.push({ tool: toolName, args, result: errorResult });
            
            langchainMessages.push(new ToolMessage({
              content: `Error: Tool '${toolName}' not available to subagents`,
              tool_call_id: toolCallId,
            }));
            continue;
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
            
            // Add tool result message
            const resultText = result.content
              .map(c => c.type === 'text' ? c.text : `[${c.type}]`)
              .join('\n');
            
            langchainMessages.push(new ToolMessage({
              content: resultText,
              tool_call_id: toolCallId,
            }));
          } catch (err) {
            const errorResult = formatErrorResult(err);
            toolCalls.push({ tool: toolName, args, result: errorResult });
            
            langchainMessages.push(new ToolMessage({
              content: errorResult.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n'),
              tool_call_id: toolCallId,
            }));
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
