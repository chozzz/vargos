// functions.tool.ts
import type { Request } from "express";
import { Injectable } from "@nestjs/common";
import { Context, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { Progress } from "@modelcontextprotocol/sdk/types";
import { FunctionsController } from "./functions.controller";
import {
  FunctionListResponseSchema,
  FunctionExecuteResponseSchema,
  FunctionSearchResponseSchema,
  FunctionReindexResponseSchema,
} from "../common/schemas/functions.schemas";

@Injectable()
export class FunctionsTool {
  constructor(private readonly functionsController: FunctionsController) {}

  @Tool({
    name: "functions-reindex",
    description: "Reindex all functions from the functions directory",
    parameters: z.object({}),
    outputSchema: FunctionReindexResponseSchema,
  })
  async reindexFunctions(params: {}, context: Context, request: Request) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = await this.functionsController.reindexFunctions();

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        success: result.success,
        totalFunctions: result.totalFunctions,
      };

      // Return the result in MCP format
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to reindex functions: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "functions-search",
    description: "Search for functions based on a query",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "The query to search for (e.g. 'weather', 'temperature', 'forecast')",
        )
        .optional()
        .default("browse"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("The maximum number of functions to return"),
    }),
    outputSchema: FunctionSearchResponseSchema,
  })
  async searchFunctions(
    { query, limit }: { query: string; limit?: number },
    context: Context,
    request: Request,
  ) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = await this.functionsController.searchFunctions(
        query,
        limit || 10,
      );

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content - controller now returns transformed data
      const structuredContent = result;

      // Return the result in MCP format
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search functions: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "functions-execute",
    description: "Execute a function with the given parameters",
    parameters: z.object({
      functionId: z.string().describe("The ID of the function to execute"),
      params: z
        .record(z.any())
        .describe("The parameters to pass to the function"),
    }),
    outputSchema: FunctionExecuteResponseSchema,
  })
  async executeFunction(
    {
      functionId,
      params,
    }: { functionId: string; params: Record<string, unknown> },
    context: Context,
    request: Request,
  ) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = await this.functionsController.executeFunction({
        functionId,
        params,
      });

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content - controller now returns wrapped data
      const structuredContent = result;

      // Return the result in MCP format
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to execute function: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }
}
