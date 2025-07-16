import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OpenAIProvider as CoreOpenAIProvider,
  LLMProvider,
  Message,
  ChatResponse,
} from "@vargos/core-lib";

@Injectable()
export class OpenAIProvider implements LLMProvider, OnModuleInit {
  private coreProvider: CoreOpenAIProvider;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("llm.openai.apiKey");
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAI provider",
      );
    }
    this.coreProvider = new CoreOpenAIProvider({ apiKey });
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await this.coreProvider.initialize();
  }

  async generateEmbeddings(text: string): Promise<number[]>;
  async generateEmbeddings(texts: string[]): Promise<number[][]>;
  async generateEmbeddings(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    return this.coreProvider.generateEmbeddings(input);
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.coreProvider.chat(messages);
  }
}
