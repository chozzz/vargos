import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { FunctionListResponse } from "../common/classes/functions-list.class";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";
import { FunctionMetadata } from "../common/classes/functions-metadata.class";
@Injectable()
export class FunctionsService {
  private readonly functionMetaCollection = "vargos-functions-meta";
  private readonly logger = new Logger(FunctionsService.name);

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

    this.logger.debug(`Listing functions from ${functionsSourceDir}`);

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

    this.logger.debug(`Found ${allFunctions.length} functions`);

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
    const functionMetas = await this.listFunctions();

    // Split functions into chunks for batch processing
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < functionMetas.functions.length; i += chunkSize) {
      chunks.push(functionMetas.functions.slice(i, i + chunkSize));
    }
    this.logger.debug(
      `Split functions into ${chunks.length} chunks of ${chunkSize}`,
    );

    // Process each chunk
    let processedChunks = 0;
    for (const chunk of chunks) {
      this.logger.debug(
        `Processing chunk ${++processedChunks}/${chunks.length} (${Math.round((processedChunks / chunks.length) * 100)}% complete)`,
      );

      // Generate embeddings for each function in chunk
      this.logger.debug(
        `Generating embeddings for ${chunk.length} functions in current chunk...`,
      );

      const functionMetaWithVectors = await Promise.all(
        chunk.map(async (functionMeta: FunctionMetadata) => {
          const text = `Name: ${functionMeta.name}\nDescription: ${functionMeta.description}\nTags: ${functionMeta.tags.join(", ")}`;
          const vector = await this.llmService.generateEmbeddings(text);
          return {
            collectionName: this.functionMetaCollection,
            id: functionMeta.id,
            vector,
            payload: functionMeta,
          };
        }),
      );

      // Index points
      this.logger.debug(
        `Indexing ${functionMetaWithVectors.length} function vectors into collection "${this.functionMetaCollection}"...`,
      );
      await Promise.all(
        functionMetaWithVectors.map((data) => this.vectorService.index(data)),
      );
      this.logger.debug(
        `Chunk ${processedChunks}/${chunks.length} processed successfully (${chunk.length} functions)`,
      );
    }

    this.logger.debug(
      `Reindexing completed successfully - processed ${functionMetas.functions.length} functions in ${chunks.length} chunks`,
    );
    return {
      success: true,
      totalFunctions: functionMetas.functions.length,
      totalChunks: chunks.length,
    };
  }

  async searchFunctions(query: string, limit: number = 10) {
    return this.vectorService.search(query, {
      collectionName: this.functionMetaCollection,
      limit,
    });
  }

  async executeFunction(functionId: string, params: any) {
    // Execute function with proper error handling
  }
}
