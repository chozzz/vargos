import { Annotation } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { VARGOS_SYSTEM_PROMPT } from "./prompts";

/**
 * Configuration schema for Vargos Agent
 */
export const ConfigurationSchema = Annotation.Root({
  /**
   * System prompt template with {system_time} placeholder
   */
  systemPromptTemplate: Annotation<string>,

  /**
   * The language model to use for the agent
   * Should be in the format: provider/model-name
   */
  model: Annotation<string>,
});

/**
 * Ensure configuration has all required fields with defaults
 */
export function ensureConfiguration(
  config: RunnableConfig,
): typeof ConfigurationSchema.State {
  const configurable = config.configurable ?? {};
  return {
    systemPromptTemplate: configurable.systemPromptTemplate ?? VARGOS_SYSTEM_PROMPT,
    model: configurable.model ?? "claude-sonnet-4-5-20250929",
  };
}
