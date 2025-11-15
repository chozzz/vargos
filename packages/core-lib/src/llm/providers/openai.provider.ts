import OpenAI from "openai";
import {
  LLMProvider,
  Message,
  ChatResponse,
} from "../interfaces/llm.interface";

export interface OpenAIProviderConfig {
  apiKey: string;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI | null = null;
  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for OpenAI provider",
      );
    }

    this.client = new OpenAI({ apiKey: this.config.apiKey });
  }

  private getClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        "OpenAI provider is not initialized. Call initialize() first.",
      );
    }
    return this.client;
  }

  async generateEmbeddings(text: string): Promise<number[]>;
  async generateEmbeddings(texts: string[]): Promise<number[][]>;
  async generateEmbeddings(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    const response = await this.getClient().embeddings.create({
      model: "text-embedding-3-small",
      input,
    });

    if (Array.isArray(input)) {
      return response.data.map((item) => item.embedding);
    }
    return response.data[0]?.embedding || [];
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    const response = await this.getClient().chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    return {
      content: response.choices[0]?.message?.content || "",
      role: response.choices[0]?.message?.role || "",
    };
  }
}

