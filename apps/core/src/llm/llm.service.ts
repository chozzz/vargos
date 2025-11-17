import { Injectable } from "@nestjs/common";
import {
  Message,
  ChatResponse,
  LLMService as CoreLLMService,
} from "@vargos/core-lib";
import { OpenAIProvider } from "./providers/openai.provider";

@Injectable()
export class LLMService {
  public readonly coreService: CoreLLMService;

  constructor(private openAIProvider: OpenAIProvider) {
    // Default to OpenAI for now, but this could be configurable
    this.coreService = new CoreLLMService(this.openAIProvider);
  }

  async generateEmbeddings(text: string): Promise<number[]>;
  async generateEmbeddings(texts: string[]): Promise<number[][]>;
  async generateEmbeddings(
    input: string | string[],
  ): Promise<number[] | number[][]> {
    if (Array.isArray(input)) {
      return this.coreService.generateEmbeddings(input);
    }
    return this.coreService.generateEmbeddings(input);
  }

  async chat(messages: Message[]): Promise<ChatResponse> {
    return this.coreService.chat(messages);
  }
}
