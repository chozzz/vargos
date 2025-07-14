import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";
import {
  VectorDBProvider,
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
} from "../interfaces/vector-db.interface";

export interface QdrantProviderConfig {
  url: string;
  apiKey: string;
  port?: number;
}

export class QdrantProvider implements VectorDBProvider {
  private client: QdrantClient | null = null;
  private config: QdrantProviderConfig;

  constructor(config: QdrantProviderConfig) {
    this.config = config;
  }

  initialize(): Promise<void> {
    if (!this.config.url || !this.config.apiKey) {
      throw new Error(
        "QDRANT_URL and QDRANT_API_KEY are required for Qdrant provider",
      );
    }

    this.client = new QdrantClient({
      url: this.config.url,
      port: this.config.port,
      apiKey: this.config.apiKey,
    });
    return Promise.resolve();
  }

  private getClient(): QdrantClient {
    if (!this.client) {
      throw new Error(
        "Qdrant provider is not initialized. Call initialize() first.",
      );
    }
    return this.client;
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    await this.getClient().createCollection(name, {
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    });
  }

  async collectionExists(name: string): Promise<boolean> {
    const response = await this.getClient().collectionExists(name);
    return response?.exists ?? false;
  }

  async search(
    vector: number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    const response = await this.getClient().search(options.collectionName, {
      vector,
      limit: options.limit || 10,
      score_threshold: options.threshold,
      filter: options.filter,
      with_payload: true,
    });

    if (!response) {
      return [];
    }

    return response.map((point) => ({
      id: String(point.id),
      score: point.score,
      payload: point.payload as Record<string, unknown>,
    }));
  }

  async index(data: VectorIndexData): Promise<void> {
    await this.getClient().upsert(data.collectionName, {
      points: [
        {
          id: uuidv5(data.id, uuidv5.URL),
          vector: data.vector,
          payload: data.payload,
        },
      ],
    });
  }

  async delete(collectionName: string, id: string): Promise<void> {
    await this.getClient().delete(collectionName, {
      points: [uuidv5(id, uuidv5.URL)],
    });
  }
}

