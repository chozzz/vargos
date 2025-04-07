import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Message,
  ChatResponse,
  LLMProvider,
} from "../common/interfaces/llm.interface";
import { OpenAIProvider } from "./providers/openai.provider";

@Injectable()
export class LLMService {
  private provider: LLMProvider;

  constructor(
    private configService: ConfigService,
    private openAIProvider: OpenAIProvider,
  ) {
    // Default to OpenAI for now, but this could be configurable
    this.provider = this.openAIProvider;
  }

  async generateEmbeddings(text: string): Promise<number[]>;
  async generateEmbeddings(texts: string[]): Promise<number[][]>;
  async generateEmbeddings(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    if (Array.isArray(input)) {
      return this.provider.generateEmbeddings(input);
    }
    return this.provider.generateEmbeddings(input);
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.provider.chat(messages);
  }
}
