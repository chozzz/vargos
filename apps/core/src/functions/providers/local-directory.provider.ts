import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { FunctionListResponse } from "../../common/classes/functions-list.class";
import { FunctionMetadata } from "../../common/classes/functions-metadata.class";
import { FunctionsProvider } from "../../common/interfaces/functions.interface";

@Injectable()
export class LocalDirectoryProvider implements FunctionsProvider, OnModuleInit {
  private readonly logger = new Logger(LocalDirectoryProvider.name);
  private functionsSourceDir!: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const functionsDir = this.configService.get<string>("FUNCTIONS_DIR");

    if (!functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    this.functionsSourceDir = path.join(functionsDir, "src");
  }

  async listFunctions(): Promise<FunctionListResponse> {
    this.logger.debug(`Listing functions from ${this.functionsSourceDir}`);

    const functions = readdirSync(this.functionsSourceDir).filter((dir) => {
      return !dir.startsWith(".");
    });

    this.logger.debug(`Found ${functions.length} functions`);

    const allFunctions = functions
      .map((functionName) => {
        try {
          const metaFile = readFileSync(
            `${this.functionsSourceDir}/${functionName}/${functionName}.meta.json`,
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

  async getFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
    const metaFilePath = path.join(
      this.functionsSourceDir,
      functionId,
      `${functionId}.meta.json`,
    );

    try {
      const metaFile = readFileSync(metaFilePath, "utf8");
      const meta = JSON.parse(metaFile);
      return {
        id: functionId,
        ...meta,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Failed to read metadata for function ${functionId}: ${errorMessage}`,
      );
      throw new Error(`Function ${functionId} not found`);
    }
  }

  async executeFunction(functionId: string, params: any): Promise<any> {
    // TODO: Implement function execution
    // This will require dynamic module loading and execution
    throw new Error("Function execution not implemented yet");
  }
}
