import { Controller, Post, Body, Get } from "@nestjs/common";
import { ShellService } from "./shell.service";
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import { ShellExecuteDto, ShellHistoryItemDto } from "./dto/shell.dto";
import {
  ShellExecuteResponseDto,
  ShellHistoryResponseDto,
  ShellInterruptResponseDto,
} from "./dto/shell-response.dto";

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
  @ApiResponse({
    status: 200,
    description: "Command executed successfully",
    type: ShellExecuteResponseDto,
  })
  async execute(@Body() body: ShellExecuteDto) {
    const output = await this.shellService.execute(body.command);
    return { command: body.command, output };
  }

  @Get("history")
  @ApiOperation({
    summary: "Get shell command history",
    description:
      "Returns the history of all commands executed in the current shell session.",
  })
  @ApiResponse({
    status: 200,
    description: "Command history",
    type: ShellHistoryResponseDto,
  })
  getHistory() {
    return this.shellService.getHistory();
  }

  @Post("interrupt")
  @ApiOperation({
    summary: "Interrupt the current shell command",
    description:
      "Sends a SIGINT signal to the currently running shell command.",
  })
  @ApiResponse({
    status: 200,
    description: "Interrupt signal sent to shell",
    type: ShellInterruptResponseDto,
  })
  async interrupt() {
    this.shellService.interrupt();
    return { success: true, message: "Interrupt signal sent to shell." };
  }
}
