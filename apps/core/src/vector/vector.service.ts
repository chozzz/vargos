import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
  VectorDBProvider,
} from "../common/interfaces/vector-db.interface";
import { LLMService } from "../llm/llm.service";
import { QdrantProvider } from "./providers/qdrant.provider";

@Injectable()
export class VectorService {
  private provider: VectorDBProvider;

  constructor(
    private configService: ConfigService,
    private llmService: LLMService,
    private qdrantProvider: QdrantProvider,
  ) {
    // Default to Qdrant for now, but this could be configurable
    this.provider = this.qdrantProvider;
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
