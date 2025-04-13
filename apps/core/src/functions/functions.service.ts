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

  async indexFunction(functionMeta: FunctionMetadata) {
    const text = `Name: ${functionMeta.name}\nDescription: ${functionMeta.description}\nTags: ${functionMeta.tags.join(", ")}`;
    const vector = await this.llmService.generateEmbeddings(text);
    const functionMetaWithVector = {
      collectionName: this.functionMetaCollection,
      id: functionMeta.id,
      vector,
      payload: functionMeta,
    };

    return await this.vectorService.index(functionMetaWithVector);
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
