import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  QdrantProvider as CoreQdrantProvider,
  VectorDBProvider,
  VectorSearchOptions,
  VectorSearchResult,
  VectorIndexData,
} from "@workspace/core-lib";

@Injectable()
export class QdrantProvider implements VectorDBProvider, OnModuleInit {
  private readonly logger = new Logger(QdrantProvider.name);
  private coreProvider: CoreQdrantProvider;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>("vector.qdrant.url");
    const apiKey = this.configService.get<string>("vector.qdrant.apiKey");
    const port = this.configService.get<number>("vector.qdrant.port");

    if (!url || !apiKey) {
      throw new Error(
        "QDRANT_URL and QDRANT_API_KEY environment variables are required for Qdrant provider",
      );
    }

    this.coreProvider = new CoreQdrantProvider({ url, apiKey, port });
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      await this.coreProvider.initialize();
      this.logger.debug("Qdrant client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Qdrant client", error);
      throw error;
    }
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    try {
      await this.coreProvider.createCollection(name, vectorSize);
      this.logger.debug(`Collection ${name} created successfully`);
    } catch (error) {
      this.logger.error(`Failed to create collection ${name}`, error);
      throw error;
    }
  }

  async collectionExists(name: string): Promise<boolean> {
    try {
      return await this.coreProvider.collectionExists(name);
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
      return await this.coreProvider.search(vector, options);
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
      await this.coreProvider.index(data);
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
      await this.coreProvider.delete(collectionName, id);
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
