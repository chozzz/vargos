import { Module } from "@nestjs/common";
import { ShellService } from "./shell.service";
import { ShellController } from "./shell.controller";
import { ShellTool } from "./shell.tool";

@Module({
  controllers: [ShellController],
  providers: [ShellService, ShellTool, ShellController],
  exports: [ShellService, ShellTool],
})
export class ShellModule {}
