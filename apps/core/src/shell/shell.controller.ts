import { Controller, Post, Body, Get } from "@nestjs/common";
import { ShellService } from "./shell.service";
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from "@nestjs/swagger";
import {
  ShellExecuteDto,
  ShellHistoryItemDto,
} from "./dto/shell.dto";

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
    schema: { example: { command: "ls", output: "file1.txt\\nfile2.txt" } },
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
    type: [ShellHistoryItemDto],
  })
  getHistory() {
    return this.shellService.getHistory();
  }
}
