import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { FunctionListResponse } from "./functions.class";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { v5 as uuidv5 } from "uuid";

@Injectable()
export class FunctionsService {
  private isQdrantInitialized = false;
  private qdrantClient: QdrantClient | undefined;
  private qFunctionMetaCollection = "vargos-functions-meta";
  private openaiClient: OpenAI | undefined;

  constructor(private configService: ConfigService) {
    if (
      this.configService.get<string>("QDRANT_URL") &&
      this.configService.get<string>("QDRANT_API_KEY")
    ) {
      this.qdrantClient = new QdrantClient({
        url: this.configService.get<string>("QDRANT_URL"),
        port: this.configService.get<number>("QDRANT_PORT") || 443,
        apiKey: this.configService.get<string>("QDRANT_API_KEY"),
      });
    } else {
      console.warn(
        "QDRANT_HOST and QDRANT_API_KEY environment variables are not set, features that require Qdrant will not work",
      );
    }

    if (this.configService.get<string>("OPENAI_API_KEY")) {
      this.openaiClient = new OpenAI({
        apiKey: this.configService.get<string>("OPENAI_API_KEY"),
      });
    } else {
      console.warn(
        "OPENAI_API_KEY environment variable is not set, features that require OpenAI will not work",
      );
    }
  }

  async init(): Promise<boolean> {
    if (this.qdrantClient) {
      // Check if the collection exists
      const collectionExists = await this.qdrantClient
        .api("collections")
        .collectionExists({
          collection_name: this.qFunctionMetaCollection,
        })
        .then((response) => {
          return response.data.result?.exists ?? false;
        });

      if (!collectionExists) {
        // Create the collection
        await this.qdrantClient.api("collections").createCollection({
          collection_name: this.qFunctionMetaCollection,
          vectors: {
            size: 1536,
            distance: "Cosine",
          },
        });

        this.isQdrantInitialized = true;
        return true;
      } else {
        this.isQdrantInitialized = true;
        return true;
      }
    }

    return false;
  }

  async listFunctions(): Promise<FunctionListResponse> {
    // Get functions directory from config
    const functionsDir = this.configService.get<string>("FUNCTIONS_DIR");
    if (!functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    // Functions are stored in src/ subdirectories following the structure:
    // src/
    //   function-name/
    //     function-name.meta.json  - Contains metadata like name, description, tags
    //     function-name.ts         - Contains the executable code
    const functionsSourceDir = path.join(functionsDir, "src");

    // Get all function directories, excluding hidden ones
    const functions = readdirSync(functionsSourceDir).filter((dir) => {
      return !dir.startsWith(".");
    });

    // Load metadata for each function
    const allFunctions = functions
      .map((functionName) => {
        try {
          const metaFile = readFileSync(
            `${functionsSourceDir}/${functionName}/${functionName}.meta.json`,
            "utf8",
          );
          const meta = JSON.parse(metaFile);
          return {
            id: functionName,
            ...meta,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return {
      functions: allFunctions,
      total: allFunctions.length,
    };
  }

  async reindexFunctions(): Promise<{
    success: boolean;
    totalFunctions: number;
    totalChunks: number;
  }> {
    // Verify Qdrant client is available
    if (!this.qdrantClient) {
      throw new Error("Qdrant is not configured.");
    }

    // Initialize Qdrant if needed
    if (!this.isQdrantInitialized) {
      console.log("Initializing Qdrant...");
      const initialized = await this.init();
      if (!initialized) {
        throw new Error("Failed to initialize Qdrant.");
      }
      console.log("Qdrant initialized successfully");
    }

    // Verify OpenAI client is available
    if (!this.openaiClient || !this.openaiClient.embeddings) {
      throw new Error("OpenAI is not configured.");
    }

    // Get list of all functions
    console.log("Fetching function metadata...");
    const functionMetas = await this.listFunctions();
    console.log(`Found ${functionMetas.functions.length} functions to index`);

    // Split functions into chunks for batch processing
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < functionMetas.functions.length; i += chunkSize) {
      chunks.push(functionMetas.functions.slice(i, i + chunkSize));
    }
    console.log(`Split functions into ${chunks.length} chunks of ${chunkSize}`);

    // Process each chunk
    let processedChunks = 0;
    for (const chunk of chunks) {
      console.log(
        `Processing chunk ${++processedChunks} of ${chunks.length}...`,
      );

      // Generate embeddings for each function in chunk
      console.log("Generating embeddings...");
      const functionVectors = await Promise.all(
        chunk.map(async (functionMeta) => {
          return await this.openaiClient?.embeddings
            .create({
              model: "text-embedding-3-small",
              input: `Function: ${functionMeta.name}\nDescription: ${functionMeta.description}\nTags: ${functionMeta.tags.join(", ")}`,
            })
            .then((response) => response.data?.[0]?.embedding || []);
        }),
      );

      // Combine metadata with vectors
      const functionMetaWithVectors = await Promise.all(
        chunk.map(async (functionMeta, index) => {
          return {
            id: functionMeta.id,
            payload: functionMeta,
            vector: functionVectors[index],
          };
        }),
      );

      // Upsert points to Qdrant
      console.log("Upserting points to Qdrant...");

      await this.qdrantClient?.api("points").upsertPoints({
        collection_name: this.qFunctionMetaCollection,
        points: functionMetaWithVectors
          .filter((elem) => elem.vector && elem.vector.length > 0)
          .map((elem) => ({
            id: uuidv5(elem.id, uuidv5.URL),
            vector: elem.vector as number[],
            payload: elem.payload as unknown as Record<string, unknown>,
          })),
      });
      console.log(`Chunk ${processedChunks} processed successfully`);
    }

    console.log("Reindexing completed successfully");
    return {
      success: true,
      totalFunctions: functionMetas.functions.length,
      totalChunks: chunks.length,
    };
  }

  getDataDir(): string {
    const dataDir = this.configService.get<string>("DATA_DIR");
    if (!dataDir) {
      throw new Error("DATA_DIR environment variable is not set");
    }
    return dataDir;
  }
}
