import {
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
  VectorDBProvider,
} from "./interfaces/vector-db.interface";
import { LLMService } from "../llm/llm.service";

export class VectorService {
  private provider: VectorDBProvider;
  private llmService: LLMService;

  constructor(provider: VectorDBProvider, llmService: LLMService) {
    this.provider = provider;
    this.llmService = llmService;
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    return await this.provider.createCollection(name, vectorSize);
  }

  async collectionExists(name: string): Promise<boolean> {
    return this.provider.collectionExists(name);
  }

  async search(
    query: string,
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    const embeddings = await this.llmService.generateEmbeddings([query]);
    const queryVector = embeddings?.[0];

    if (!queryVector) {
      throw new Error("Failed to generate query vector");
    }

    return this.provider.search(queryVector, options);
  }

  async index(data: VectorIndexData): Promise<void> {
    await this.provider.index(data);
  }

  async delete(collectionName: string, id: string): Promise<void> {
    await this.provider.delete(collectionName, id);
  }
}

