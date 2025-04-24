import {
  Injectable,
  Logger,
  OnModuleInit,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, readdirSync, readFileSync } from "fs";
import path, { resolve } from "path";
import { spawn } from "child_process";
import { FunctionListResponse } from "../../common/classes/functions-list.class";
import { FunctionMetadata } from "../../common/classes/functions-metadata.class";
import { FunctionsProvider } from "../../common/interfaces/functions.interface";

@Injectable()
export class LocalDirectoryProvider implements FunctionsProvider, OnModuleInit {
  private readonly logger = new Logger(LocalDirectoryProvider.name);
  private functionsDir!: string;
  private functionsSourceDir!: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    this.functionsDir = this.configService.get<string>("FUNCTIONS_DIR") || "";

    if (!this.functionsDir) {
      throw new Error("FUNCTIONS_DIR environment variable is not set");
    }

    this.functionsSourceDir = path.join(this.functionsDir, "src");
  }

  async getFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
    try {
      const metaFilePath = path.join(
        this.functionsSourceDir,
        functionId,
        `${functionId}.meta.json`,
      );
      const metaFile = readFileSync(metaFilePath, "utf8");
      const meta: Omit<FunctionMetadata, "id"> = JSON.parse(metaFile);

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

  async listFunctions(): Promise<FunctionListResponse> {
    this.logger.debug(`Listing functions from ${this.functionsSourceDir}`);

    const functions = readdirSync(this.functionsSourceDir).filter((dir) => {
      return !dir.startsWith(".");
    });

    const allFunctions = await Promise.all(
      functions.map((functionId) => this.getFunctionMetadata(functionId)),
    );

    this.logger.debug(`Found ${allFunctions.length} functions`);

    return {
      functions: allFunctions,
      total: allFunctions.length,
    };
  }

  async executeFunction<T = Record<string, unknown>, R = unknown>(
    functionId: string,
    params: T,
  ): Promise<R> {
    // Check if function exists
    const functionPath = resolve(this.functionsSourceDir, functionId);
    if (!existsSync(functionPath)) {
      throw new Error(`Function "${functionId}" not found`);
    }

    return new Promise((resolve, reject) => {
      const childProcess = spawn(
        "pnpm",
        ["--silent", "run-function", functionId, JSON.stringify(params)],
        {
          env: process.env,
          cwd: this.functionsDir,
        },
      );

      let stdout = "";
      let stderr = "";

      childProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      childProcess.on("close", (code) => {
        if (code !== 0) {
          // Try to parse stdout as JSON error
          let errorObj: any = {};
          try {
            errorObj = JSON.parse(stdout.trim());
          } catch {
            try {
              errorObj = JSON.parse(stderr.trim());
            } catch {
              errorObj = { error: "UnknownError", message: stderr.trim() || stdout.trim() };
            }
          }
          // Always shape to { error, message }
          if (typeof errorObj === "string") {
            errorObj = { error: "UnknownError", message: errorObj };
          }
          if (!errorObj.error) errorObj.error = "UnknownError";
          if (!errorObj.message) errorObj.message = errorObj.error;
          reject(errorObj);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (e) {
          reject({ error: "ParseError", message: "Failed to parse function output" });
        }
      });
    });
  }
}
