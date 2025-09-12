/**
 * Context Loading for Vargos Agent
 *
 * Loads relevant context before calling the LLM to improve response quality.
 * Best practices:
 * 1. Load context BEFORE model invocation (not during)
 * 2. Use semantic search to find relevant information
 * 3. Keep context concise and relevant
 * 4. Format context clearly in system prompt
 */

import { BaseMessage } from "@langchain/core/messages";
import { getVargosCoreServices } from "../shared/services/vargos-core";

export interface LoadedContext {
  /**
   * Relevant functions that might be useful for the current query
   */
  relevantFunctions: Array<{
    id: string;
    name: string;
    description: string;
    score: number;
  }>;
  
  /**
   * Formatted context string ready to inject into system prompt
   */
  formattedContext: string;
}

/**
 * Extract a search query from recent messages
 * Uses the last user message, or combines recent messages if needed
 */
function extractQuery(messages: BaseMessage[]): string {
  // Get the last user message (most relevant)
  const userMessages = messages.filter(
    (msg) => msg.getType() === "human"
  );
  
  if (userMessages.length === 0) {
    return "";
  }
  
  const lastUserMessage = userMessages[userMessages.length - 1];
  if (!lastUserMessage) {
    return "";
  }
  
  const content = lastUserMessage.content;
  
  if (typeof content === "string") {
    return content;
  }
  
  // Handle array content (multimodal)
  if (Array.isArray(content)) {
    const textParts = content
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text);
    return textParts.join(" ");
  }
  
  return "";
}

/**
 * Load relevant context for the current conversation
 * 
 * Context sources:
 * 1. Relevant functions (via vector search)
 * 2. Future: User preferences, recent actions, etc.
 * 
 * @param messages - Current conversation messages
 * @param maxFunctions - Maximum number of relevant functions to load (default: 5)
 * @returns Loaded context with formatted string
 */
export async function loadContext(
  messages: BaseMessage[],
  maxFunctions: number = 5,
): Promise<LoadedContext> {
  const query = extractQuery(messages);
  
  // If no query, return empty context
  if (!query.trim()) {
    return {
      relevantFunctions: [],
      formattedContext: "",
    };
  }
  
  try {
    const { vectorService } = getVargosCoreServices();
    
    // Search for relevant functions using semantic search
    const functionResults = await vectorService.search(query, {
      collectionName: "vargos-functions-meta",
      limit: maxFunctions,
      threshold: 0.5, // Only include reasonably relevant results
    });
    
    const relevantFunctions = functionResults.map((result) => {
      const payload = result.payload as {
        id: string;
        name: string;
        description: string;
      };
      
      return {
        id: payload.id || result.id,
        name: payload.name || "Unknown",
        description: payload.description || "",
        score: result.score,
      };
    });
    
    // Format context for system prompt
    let formattedContext = "";
    
    if (relevantFunctions.length > 0) {
      formattedContext = "\n\n## Relevant Functions\n";
      formattedContext += "The following functions may be useful for this request:\n\n";
      
      relevantFunctions.forEach((func, index) => {
        formattedContext += `${index + 1}. **${func.name}** (${func.id})\n`;
        formattedContext += `   ${func.description}\n`;
        formattedContext += `   Relevance: ${(func.score * 100).toFixed(1)}%\n\n`;
      });
      
      formattedContext +=
        "Consider using these functions if they match the user's needs.\n";
    }
    
    return {
      relevantFunctions,
      formattedContext,
    };
  } catch (error) {
    // If context loading fails, log but don't break the agent
    console.warn(
      `[${new Date().toISOString()}] [Context Loader] Failed to load context:`,
      error instanceof Error ? error.message : String(error)
    );
    
    return {
      relevantFunctions: [],
      formattedContext: "",
    };
  }
}

