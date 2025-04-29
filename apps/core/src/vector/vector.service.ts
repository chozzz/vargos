import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  VectorClient,
  SearchOptions,
  SearchResult,
  IndexData,
  VectorDBProvider,
} from "../common/interfaces/vector-db.interface";
import { LLMService } from "../llm/llm.service";
import { QdrantProvider } from "./providers/qdrant.provider";

@Injectable()
export class VectorService implements VectorClient, OnModuleInit {
  private provider: VectorDBProvider;

  constructor(
    private configService: ConfigService,
    private llmService: LLMService,
    private qdrantProvider: QdrantProvider,
  ) {
    // Default to Qdrant for now, but this could be configurable
    this.provider = this.qdrantProvider;
  }

  async onModuleInit() {
    await this.provider.initialize?.();
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    await this.provider.createCollection(name, vectorSize);
  }

  async collectionExists(name: string): Promise<boolean> {
    return this.provider.collectionExists(name);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const queryVector = await this.llmService.generateEmbedding(query);
    return this.provider.search(queryVector, options);
  }

  async index(data: IndexData): Promise<void> {
    await this.provider.index(data);
  }

  async delete(collectionName: string, id: string): Promise<void> {
    await this.provider.delete(collectionName, id);
  }
}
