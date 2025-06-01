import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";
import {
  VectorDBProvider,
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
} from "../../common/interfaces/vector-db.interface";

@Injectable()
export class QdrantProvider implements VectorDBProvider, OnModuleInit {
  private readonly logger = new Logger(QdrantProvider.name);
  private client!: QdrantClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      const url = this.configService.get<string>("vector.qdrant.url");
      const apiKey = this.configService.get<string>("vector.qdrant.apiKey");
      const port = this.configService.get<number>("vector.qdrant.port");

      if (!url || !apiKey) {
        throw new Error(
          "QDRANT_URL and QDRANT_API_KEY environment variables are required for Qdrant provider",
        );
      }

      this.client = new QdrantClient({
        url,
        port,
        apiKey,
      });

      this.logger.debug("Qdrant client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Qdrant client", error);
      throw error;
    }
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    try {
      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
      this.logger.debug(`Collection ${name} created successfully`);
    } catch (error) {
      this.logger.error(`Failed to create collection ${name}`, error);
      throw error;
    }
  }

  async collectionExists(name: string): Promise<boolean> {
    try {
      const response = await this.client.collectionExists(name);

      return response?.exists ?? false;
    } catch (error) {
      this.logger.error(`Failed to check if collection ${name} exists`, error);
      throw error;
    }
  }

  async search(
    vector: number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    try {
      const response = await this.client.search(options.collectionName, {
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
        payload: point.payload as Record<string, any>,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to search in collection ${options.collectionName}`,
        error,
      );
      throw error;
    }
  }

  async index(data: VectorIndexData): Promise<void> {
    try {
      await this.client.upsert(data.collectionName, {
        points: [
          {
            id: uuidv5(data.id, uuidv5.URL),
            vector: data.vector,
            payload: data.payload,
          },
        ],
      });
      this.logger.debug(
        `Indexed data for ${data.id} in collection ${data.collectionName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to index data for ${data.id} in collection ${data.collectionName}`,
        error,
      );
      throw error;
    }
  }

  async delete(collectionName: string, id: string): Promise<void> {
    try {
      await this.client.delete(collectionName, {
        points: [uuidv5(id, uuidv5.URL)],
      });
      this.logger.debug(
        `Deleted point ${id} from collection ${collectionName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete point ${id} from collection ${collectionName}`,
        error,
      );
      throw error;
    }
  }
}
