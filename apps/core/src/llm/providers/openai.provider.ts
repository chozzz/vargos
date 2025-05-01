import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  LLMProvider,
  Message,
  ChatResponse,
} from "../../common/interfaces/llm.interface";

@Injectable()
export class OpenAIProvider implements LLMProvider, OnModuleInit {
  private client!: OpenAI;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const apiKey = this.configService.get<string>("llm.openai.apiKey");
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAI provider",
      );
    }

    this.client = new OpenAI({ apiKey });
  }

  private getClient(): OpenAI {
    if (!this.client) {
      throw new Error(
        "OpenAI provider is not initialized. Please ensure OPENAI_API_KEY is set.",
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
