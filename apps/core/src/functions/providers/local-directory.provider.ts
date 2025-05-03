import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { FunctionListResponse } from "../../common/classes/functions-list.class";
import { FunctionMetadata } from "../../common/classes/functions-metadata.class";
import { FunctionsProvider } from "../../common/interfaces/functions.interface";

@Injectable()
export class LocalDirectoryProvider implements FunctionsProvider {
  private readonly logger = new Logger(LocalDirectoryProvider.name);

  constructor(private configService: ConfigService) {}

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

  async getFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
    const functionsDir = this.configService.get<string>("FUNCTIONS_DIR");
    if (!functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    const metaFilePath = path.join(
      functionsDir,
      "src",
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
