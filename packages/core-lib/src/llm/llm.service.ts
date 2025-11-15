import {
  Message,
  ChatResponse,
  LLMProvider,
} from "./interfaces/llm.interface";

export class LLMService {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
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

