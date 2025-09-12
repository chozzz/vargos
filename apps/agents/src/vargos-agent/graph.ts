import { AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { initChatModel } from "langchain/chat_models/universal";

import { ConfigurationSchema, ensureConfiguration } from "./configuration";
import { TOOLS } from "./tools";
import { checkpointer } from "../index";
import { loadContext } from "./context";

/**
 * Call the LLM with Vargos tools
 */
async function callModel(
  state: typeof MessagesAnnotation.State,
  config: RunnableConfig,
): Promise<typeof MessagesAnnotation.Update> {
  const configuration = ensureConfiguration(config);

  // Load relevant context (functions, etc.) before calling the model
  const [context, model] = await Promise.all([
    loadContext(state.messages, 5),
    initChatModel(
      configuration.model, 
      {
        temperature: 0
      }
    ).then(model => {
      return model.bindTools(TOOLS);
    }),
  ]);

  // Prepare system message with current time and loaded context
  const systemMessage = {
    role: "system" as const,
    content: configuration.systemPromptTemplate
      .replace("{system_time}", new Date().toISOString())
      .replace("{context}", context.formattedContext),
  };

  const runInput: Parameters<typeof model.invoke>[0] = [systemMessage, ...state.messages];

  console.info(`[${new Date().toISOString()}] [Vargos Agent] Input Size: ${runInput.length}`);
  
  // Invoke model with system prompt + conversation history
  const response = await model.invoke(runInput);

  return { messages: [response] };
}

/**
 * Determine whether to continue to tools or end
 */
function routeModelOutput(state: typeof MessagesAnnotation.State): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // If the LLM is invoking tools, route to tools node
  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  // Otherwise end the graph
  return "__end__";
}

/**
 * Build the Vargos Agent graph
 */
const workflow = new StateGraph(MessagesAnnotation, ConfigurationSchema)
  // Add nodes
  .addNode("callModel", callModel)
  .addNode("tools", new ToolNode(TOOLS))

  // Set entry point
  .addEdge("__start__", "callModel")

  // Conditional routing from callModel
  .addConditionalEdges("callModel", routeModelOutput)

  // After tools, return to callModel
  .addEdge("tools", "callModel");

/**
 * Compile and export the graph
 */
export const graph = workflow.compile({
  checkpointer, // Persistent conversation history via PostgreSQL
  interruptBefore: [],
  interruptAfter: [],
});

graph.name = "Vargos Agent";
