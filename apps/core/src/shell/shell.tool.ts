// shell.tool.ts
import type { Request } from "express";
import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { Progress } from "@modelcontextprotocol/sdk/types";
import { ShellController } from "./shell.controller";
import {
  ShellExecuteResponseSchema,
  ShellHistoryResponseSchema,
  ShellStatusResponseSchema,
  ShellInterruptResponseSchema,
} from "../common/schemas/shell.schemas";

@Injectable()
export class ShellTool {
  constructor(private readonly shellController: ShellController) {}

  @Tool({
    name: "shell-execute",
    description: "Execute a shell command in the persistent shell session",
    parameters: z.object({
      command: z
        .string()
        .describe("The shell command to execute (e.g. 'ls -la')"),
    }),
    outputSchema: ShellExecuteResponseSchema,
  })
  async execute(
    { command }: { command: string },
    context: any,
    request: Request,
  ) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = await this.shellController.execute({ command });

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        command: result.command,
        output: result.output,
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
            text: `Failed to execute shell command: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "shell-history",
    description: "Get shell command history from the current session",
    parameters: z.object({}),
    outputSchema: ShellHistoryResponseSchema,
  })
  async getHistory(params: {}, context: any, request: Request) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = this.shellController.getHistory();

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
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
            text: `Failed to get shell history: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }

  @Tool({
    name: "shell-interrupt",
    description: "Interrupt the currently running shell command",
    parameters: z.object({}),
    outputSchema: ShellInterruptResponseSchema,
  })
  async interrupt(params: {}, context: any, request: Request) {
    try {
      // Simulate progress for the operation
      await context.reportProgress({
        progress: 50,
        total: 100,
      } as Progress);

      const result = await this.shellController.interrupt();

      await context.reportProgress({
        progress: 100,
        total: 100,
      } as Progress);

      // Generate structured content
      const structuredContent = {
        success: result.success,
        message: result.message,
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
            text: `Failed to interrupt shell command: ${errorMessage}`,
          },
        ],
        structuredContent: {},
        isError: true,
      };
    }
  }
}
