import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { FunctionListResponse } from "../common/classes/functions-metadata.class";
import { v5 as uuidv5 } from "uuid";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";

@Injectable()
export class FunctionsService {
  private readonly functionMetaCollection = "vargos-functions-meta";

  constructor(
    private configService: ConfigService,
    private vectorService: VectorService,
    private llmService: LLMService,
  ) {}

  async listFunctions(): Promise<FunctionListResponse> {
    const functionsDir = this.configService.get<string>("FUNCTIONS_DIR");
    if (!functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    const functionsSourceDir = path.join(functionsDir, "src");
    const functions = readdirSync(functionsSourceDir).filter((dir) => {
      return !dir.startsWith(".");
    });

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
          const text = `Function: ${functionMeta.name}\nDescription: ${functionMeta.description}\nTags: ${functionMeta.tags.join(", ")}`;
          return await this.llmService.generateEmbedding(text);
        }),
      );

      // Combine metadata with vectors
      const functionMetaWithVectors = chunk.map((functionMeta, index) => {
        const vector = functionVectors[index];
        if (!vector) {
          throw new Error(
            `Failed to generate embedding for function ${functionMeta.id}`,
          );
        }
        return {
          collectionName: this.functionMetaCollection,
          id: functionMeta.id,
          vector,
          payload: functionMeta,
        };
      });

      // Index points
      console.log("Indexing points...");
      await Promise.all(
        functionMetaWithVectors.map((data) => this.vectorService.index(data)),
      );
      console.log(`Chunk ${processedChunks} processed successfully`);
    }

    console.log("Reindexing completed successfully");
    return {
      success: true,
      totalFunctions: functionMetas.functions.length,
      totalChunks: chunks.length,
    };
  }

  async searchFunctions(query: string) {
    return this.vectorService.search(query, {
      collectionName: this.functionMetaCollection,
      limit: 10,
    });
  }

  getDataDir(): string {
    const dataDir = this.configService.get<string>("DATA_DIR");
    if (!dataDir) {
      throw new Error("DATA_DIR environment variable is not set");
    }
    return dataDir;
  }

  async executeFunction(functionId: string, params: any) {
    // Execute function with proper error handling
  }

  async indexFunctions() {
    // Use vector service for indexing
  }
}
