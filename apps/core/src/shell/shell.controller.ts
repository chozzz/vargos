import { Controller, Post, Body, Get } from "@nestjs/common";
import { ZodValidationPipe } from 'nestjs-zod';
import { ShellService } from "./shell.service";
import { ApiOperation, ApiTags, ApiBody, ApiOkResponse } from "@nestjs/swagger";
import { 
  ShellExecuteDto, 
  ShellHistoryItemDto, 
  ShellExecuteResponseDto,
  ShellInterruptResponseDto, 
  ShellExecuteResponseSchema,
  ShellHistoryItemSchema,
  ShellInterruptResponseSchema
} from "./schemas/shell.schema";
import { z } from "zod";
import { Tool } from "@rekog/mcp-nest";

@ApiTags("Shell")
@Controller("shell")
export class ShellController {
  constructor(private readonly shellService: ShellService) {}

  @Post("execute")
  @ApiOperation({
    summary: "Execute a shell command",
    description:
      "Executes a command in the persistent shell session and returns the output.",
  })
  @ApiBody({ type: ShellExecuteDto })
  @ApiOkResponse({
    description: "Command executed successfully",
    type: ShellExecuteResponseDto,
  })
  @Tool({
    name: 'execute-shell',
    description: 'Execute a shell command',
    parameters: z.object({
      command: z.string().describe('The command to execute'),
    }),
    outputSchema: ShellExecuteResponseSchema,
  })
  async execute(@Body(new ZodValidationPipe()) body: ShellExecuteDto): Promise<ShellExecuteResponseDto> {
    const output = await this.shellService.execute(body.command);
    return { command: body.command, output };
  }

  @Get("history")
  @ApiOperation({
    summary: "Get shell command history",
    description:
      "Returns the history of all commands executed in the current shell session.",
  })
  @ApiOkResponse({
    description: "Command history",
    type: [ShellHistoryItemDto],
  })
  @Tool({
    name: 'get-shell-history',
    description: 'Get shell command history',
    outputSchema: z.array(ShellHistoryItemSchema),
  })
  getHistory(): ShellHistoryItemDto[] {
    return this.shellService.getHistory();
  }

  @Post("interrupt")
  @ApiOperation({
    summary: "Interrupt the current shell command",
    description:
      "Sends a SIGINT signal to the currently running shell command.",
  })
  @ApiOkResponse({
    description: "Interrupt signal sent to shell",
    type: ShellInterruptResponseDto,
  })
  @Tool({
    name: 'interrupt-shell',
    description: 'Interrupt the current shell command',
    outputSchema: ShellInterruptResponseSchema,
  })
  async interrupt(): Promise<ShellInterruptResponseDto> {
    this.shellService.interrupt();
    return { success: true, message: "Interrupt signal sent to shell." };
  }
}
