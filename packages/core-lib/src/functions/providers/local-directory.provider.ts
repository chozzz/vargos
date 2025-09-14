import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import path, { resolve } from "path";
import { spawn } from "child_process";
import { FunctionListResponse, FunctionMetadata } from "../types/functions.types";
import { FunctionsProvider, CreateFunctionInput } from "../interfaces/functions.interface";

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

  async getFunctionMetadata(functionId: string): Promise<FunctionMetadata> {
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

      return Promise.resolve({
        id: functionId,
        ...meta,
      });
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
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [LocalDirectoryProvider] Function "${functionId}" exited with code ${code}`);
        console.log(`[${timestamp}] [LocalDirectoryProvider] stdout length: ${stdout.length} chars`);
        console.log(`[${timestamp}] [LocalDirectoryProvider] stderr length: ${stderr.length} chars`);
        
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
          console.error(`[${timestamp}] [LocalDirectoryProvider] Function error:`, errorObj);
          console.error(`[${timestamp}] [LocalDirectoryProvider] stdout content:`, stdout.substring(0, 500));
          console.error(`[${timestamp}] [LocalDirectoryProvider] stderr content:`, stderr.substring(0, 500));
          reject(new Error(`${errorObj.error}: ${errorObj.message}`));
          return;
        }
        
        // Try to parse stdout as JSON
        // First, try direct parse
        try {
          const trimmed = stdout.trim();
          console.log(`[${timestamp}] [LocalDirectoryProvider] Attempting to parse stdout (first 200 chars):`, trimmed.substring(0, 200));
          
          // Try to find JSON in the output (in case there's other text)
          let jsonStr = trimmed;
          
          // Look for JSON object/array boundaries
          const jsonStart = trimmed.search(/[{\[]/);
          
          if (jsonStart !== -1) {
            // Try to extract JSON from the string
            let braceCount = 0;
            let bracketCount = 0;
            let startIdx = jsonStart;
            let endIdx = jsonStart;
            
            for (let i = jsonStart; i < trimmed.length; i++) {
              if (trimmed[i] === '{') braceCount++;
              if (trimmed[i] === '}') braceCount--;
              if (trimmed[i] === '[') bracketCount++;
              if (trimmed[i] === ']') bracketCount--;
              
              if (braceCount === 0 && bracketCount === 0 && (trimmed[i] === '}' || trimmed[i] === ']')) {
                endIdx = i + 1;
                break;
              }
            }
            
            if (endIdx > startIdx) {
              jsonStr = trimmed.substring(startIdx, endIdx);
              console.log(`[${timestamp}] [LocalDirectoryProvider] Extracted JSON substring (${startIdx}-${endIdx})`);
            }
          }
          
          const result = JSON.parse(jsonStr) as R;
          console.log(`[${timestamp}] [LocalDirectoryProvider] Successfully parsed result`);
          resolve(result);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          console.error(`[${timestamp}] [LocalDirectoryProvider] ❌ JSON parse failed`);
          console.error(`[${timestamp}] [LocalDirectoryProvider] Parse error: ${errorMessage}`);
          console.error(`[${timestamp}] [LocalDirectoryProvider] stdout (full):`, stdout);
          console.error(`[${timestamp}] [LocalDirectoryProvider] stdout (first 500 chars):`, stdout.substring(0, 500));
          console.error(`[${timestamp}] [LocalDirectoryProvider] stdout (last 500 chars):`, stdout.substring(Math.max(0, stdout.length - 500)));
          console.error(`[${timestamp}] [LocalDirectoryProvider] stderr:`, stderr);
          
          reject(
            new Error(
              `ParseError: Failed to parse function output. ` +
              `Error: ${errorMessage}. ` +
              `Output length: ${stdout.length} chars. ` +
              `First 200 chars: ${stdout.substring(0, 200)}`
            ),
          );
        }
      });
    });
  }

  async createFunction(input: CreateFunctionInput): Promise<FunctionMetadata> {
    const { metadata, code } = input;

    // Generate kebab-case functionId from name
    const functionId = metadata.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Create function directory
    const functionDir = path.join(this.functionsSourceDir, functionId);
    if (existsSync(functionDir)) {
      throw new Error(`Function "${functionId}" already exists`);
    }

    try {
      mkdirSync(functionDir, { recursive: true });

      // Write metadata file
      const metaFilePath = path.join(functionDir, `${functionId}.meta.json`);
      const metaContent = {
        name: metadata.name,
        category: metadata.category,
        description: metadata.description,
        tags: metadata.tags,
        requiredEnvVars: metadata.requiredEnvVars,
        input: metadata.input,
        output: metadata.output,
      };
      writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 2));

      // Write index.ts with provided code or default template
      const indexFilePath = path.join(functionDir, "index.ts");
      const indexContent = code || this.generateDefaultFunctionCode(metadata);
      writeFileSync(indexFilePath, indexContent);

      return {
        id: functionId,
        ...metadata,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Failed to create function ${functionId}: ${errorMessage}`,
      );
    }
  }

  private generateDefaultFunctionCode(
    metadata: Omit<FunctionMetadata, "id">,
  ): string {
    const inputParams = metadata.input
      .map((input) => `  ${input.name}: ${input.type};`)
      .join("\n");

    const outputType =
      metadata.output.length > 0 && metadata.output[0]
        ? metadata.output[0].type
        : "unknown";

    return `/**
 * ${metadata.description}
 */
export default async function ${metadata.name.replace(/[^a-zA-Z0-9]/g, "")}(params: {
${inputParams}
}): Promise<${outputType}> {
  // TODO: Implement function logic
  throw new Error("Function not yet implemented");
}
`;
  }
}

