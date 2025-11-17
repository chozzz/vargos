import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  LocalDirectoryProvider as CoreLocalDirectoryProvider,
  FunctionsProvider,
} from "@vargos/core-lib";

@Injectable()
export class LocalDirectoryProvider implements FunctionsProvider, OnModuleInit {
  private readonly logger = new Logger(LocalDirectoryProvider.name);
  private coreProvider: CoreLocalDirectoryProvider;

  constructor(private configService: ConfigService) {
    const functionsDir = this.configService.get<string>("FUNCTIONS_DIR") || "";

    if (!functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    this.coreProvider = new CoreLocalDirectoryProvider({ functionsDir });
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await this.coreProvider.initialize();
  }

  async getFunctionMetadata(functionId: string) {
    try {
      return await this.coreProvider.getFunctionMetadata(functionId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Failed to read metadata for function ${functionId}: ${errorMessage}`,
      );
      throw error;
    }
  }

  async listFunctions() {
    try {
      return await this.coreProvider.listFunctions();
    } catch (error) {
      this.logger.error("Failed to list functions", error);
      throw error;
    }
  }

  async executeFunction<T = Record<string, unknown>, R = unknown>(
    functionId: string,
    params: T,
  ): Promise<R> {
    try {
      return await this.coreProvider.executeFunction(functionId, params);
    } catch (error) {
      this.logger.error(`Failed to execute function ${functionId}`, error);
      throw error;
    }
  }
}
