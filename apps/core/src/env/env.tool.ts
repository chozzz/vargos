// env.tool.ts
import type { Request } from "express";
import { Injectable } from "@nestjs/common";
import { Tool, Resource, Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { Progress, ResultSchema  } from "@modelcontextprotocol/sdk/types";
import { EnvController } from "./env.controller";

@Injectable()
export class EnvTool {
  constructor(private readonly envController: EnvController) {}

  @Tool({
    name: "env-get",
    description: "Get a specific environment variable by key",
    parameters: z.object({
      key: z.string().describe("The environment variable key to retrieve"),
    }),
    outputSchema: z.object({
      data: z.object({
        key: z.string(),
        value: z.string(),
      }),
      success: z.boolean(),
    }),
  })
  async getEnvVar(
    { key }: { key: string },
    context: Context,
    request: Request,
  ) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = this.envController.get(key);

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        data: result,
        success: true,
      };

      // Return the result in this specific structured format as per MCP specification.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent),
          },
        ],
        structuredContent,
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get environment variable: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "env-set",
    description: "Set or update an environment variable",
    parameters: z.object({
      key: z.string().describe("The environment variable key to set"),
      value: z.string().describe("The value to set for the environment variable"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      key: z.string(),
      value: z.string(),
    }),
  })
  async setEnvVar(
    { key, value }: { key: string; value: string },
    context: Context,
    request: Request,
  ) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = this.envController.set({ key, value });

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        success: result.success,
        key: result.key,
        value: result.value,
      };

      // Return the result in this specific structured format as per MCP specification.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent),
          },
        ],
        structuredContent,
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to set environment variable: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "env-search",
    description: "Search environment variables by keyword, censoring sensitive values",
    parameters: z.object({
      keyword: z.string().optional().default("").describe("Search keyword for env variable key or value (optional, defaults to empty string to list all)"),
    }),
    outputSchema: z.object({
      data: z.array(z.object({
        key: z.string().optional().default(""),
        value: z.string().optional().default(""),
      })),
      count: z.number().optional().default(0),
    }),
  })
  async searchEnvVars(
    { keyword }: { keyword?: string },
    context: Context,
    request: Request,
  ) {
    try {
      // Use empty string if keyword is undefined, matching controller behavior
      const searchKeyword = keyword || "";

      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = this.envController.search(searchKeyword);

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        data: result,
        count: result.length,
      };

      // Return the result in this specific structured format as per MCP specification.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent),
          },
        ],
        structuredContent,
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search environment variables: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }
}
