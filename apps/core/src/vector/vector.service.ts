import { Injectable } from "@nestjs/common";
import {
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
  VectorService as CoreVectorService,
} from "@workspace/core-lib";
import { LLMService } from "../llm/llm.service";
import { QdrantProvider } from "./providers/qdrant.provider";

@Injectable()
export class VectorService {
  public readonly coreService: CoreVectorService;

  constructor(
    private llmService: LLMService,
    private qdrantProvider: QdrantProvider,
  ) {
    // Default to Qdrant for now, but this could be configurable
    this.coreService = new CoreVectorService(
      this.qdrantProvider,
      this.llmService.coreService,
    );
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    return await this.coreService.createCollection(name, vectorSize);
  }

  async collectionExists(name: string): Promise<boolean> {
    return this.coreService.collectionExists(name);
  }

  async search(
    query: string,
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    return this.coreService.search(query, options);
  }

  async index(data: VectorIndexData): Promise<void> {
    await this.coreService.index(data);
  }

  async delete(collectionName: string, id: string): Promise<void> {
    await this.coreService.delete(collectionName, id);
  }
}
