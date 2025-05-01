import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  LLMClient,
  Message,
  ChatResponse,
  LLMProvider,
} from "../common/interfaces/llm.interface";
import { OpenAIProvider } from "./providers/openai.provider";

@Injectable()
export class LLMService implements LLMClient {
  private provider: LLMProvider;

  constructor(
    private configService: ConfigService,
    private openAIProvider: OpenAIProvider,
  ) {
    // Default to OpenAI for now, but this could be configurable
    this.provider = this.openAIProvider;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.provider.generateEmbeddings(text);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return this.provider.generateEmbeddings(texts);
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.provider.chat(messages);
  }
}
