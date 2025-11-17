import { existsSync, readdirSync, readFileSync } from "fs";
import path, { resolve } from "path";
import { spawn } from "child_process";
import { FunctionListResponse, FunctionMetadata } from "../types/functions.types";
import { FunctionsProvider } from "../interfaces/functions.interface";

export interface LocalDirectoryProviderConfig {
  functionsDir: string;
}

export class LocalDirectoryProvider implements FunctionsProvider {
  private functionsDir: string;
  private functionsSourceDir: string;

  constructor(config: LocalDirectoryProviderConfig) {
    this.functionsDir = config.functionsDir;
    this.functionsSourceDir = path.join(this.functionsDir, "src");
  }

  initialize(): Promise<void> {
    if (!this.functionsDir) {
      throw new Error("FUNCTIONS_DIR is required for LocalDirectoryProvider");
    }
    // Ensure source directory exists
    if (!existsSync(this.functionsSourceDir)) {
      throw new Error(
        `Functions source directory does not exist: ${this.functionsSourceDir}`,
      );
    }
    return Promise.resolve();
  }

  getFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
    try {
      const metaFilePath = path.join(
        this.functionsSourceDir,
        functionId,
        `${functionId}.meta.json`,
      );
      const metaFile = readFileSync(metaFilePath, "utf8");
      const parsedMeta = JSON.parse(metaFile) as unknown;
      if (
        typeof parsedMeta !== "object" ||
        parsedMeta === null ||
        !("name" in parsedMeta)
      ) {
        throw new Error(`Invalid metadata format for function ${functionId}`);
      }
      const meta = parsedMeta as Omit<FunctionMetadata, "id">;

      return {
        id: functionId,
        ...meta,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to read metadata for function ${functionId}: ${errorMessage}`,
      );
    }
  }

  async listFunctions(): Promise<FunctionListResponse> {
    const functions = readdirSync(this.functionsSourceDir).filter((dir) => {
      return !dir.startsWith(".");
    });

    const allFunctions = await Promise.all(
      functions.map((functionId) => this.getFunctionMetadata(functionId)),
    );

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

      childProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString("utf-8");
      });

      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf-8");
      });

      childProcess.on("close", (code) => {
        if (code !== 0) {
          // Try to parse stdout as JSON error
          let errorObj: { error: string; message: string } = {
            error: "UnknownError",
            message: "",
          };
          try {
            const parsed = JSON.parse(stdout.trim()) as unknown;
            if (
              typeof parsed === "object" &&
              parsed !== null &&
              ("error" in parsed || "message" in parsed)
            ) {
              errorObj = {
                error:
                  "error" in parsed && typeof parsed.error === "string"
                    ? parsed.error
                    : "UnknownError",
                  message:
                    "message" in parsed && typeof parsed.message === "string"
                      ? parsed.message
                      : typeof parsed === "string"
                        ? parsed
                        : JSON.stringify(parsed),
              };
            } else if (typeof parsed === "string") {
              errorObj = { error: "UnknownError", message: parsed };
            }
          } catch {
            try {
              const parsed = JSON.parse(stderr.trim()) as unknown;
              if (
                typeof parsed === "object" &&
                parsed !== null &&
                ("error" in parsed || "message" in parsed)
              ) {
                errorObj = {
                  error:
                    "error" in parsed && typeof parsed.error === "string"
                      ? parsed.error
                      : "UnknownError",
                  message:
                    "message" in parsed && typeof parsed.message === "string"
                      ? parsed.message
                      : typeof parsed === "string"
                        ? parsed
                        : JSON.stringify(parsed),
                };
              } else if (typeof parsed === "string") {
                errorObj = { error: "UnknownError", message: parsed };
              }
            } catch {
              errorObj = {
                error: "UnknownError",
                message: stderr.trim() || stdout.trim(),
              };
            }
          }
          // Always shape to { error, message }
          if (!errorObj.message) {
            errorObj.message = errorObj.error;
          }
          reject(new Error(`${errorObj.error}: ${errorObj.message}`));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim()) as R;
          resolve(result);
        } catch {
          reject(
            new Error("ParseError: Failed to parse function output"),
          );
        }
      });
    });
  }
}

