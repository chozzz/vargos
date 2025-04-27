import { ApiProperty } from "@nestjs/swagger";

export class ShellExecuteDto {
  @ApiProperty({
    description:
      "The shell command to execute in the persistent shell session.",
    example: "ls -la",
  })
  command!: string;
}

export class ShellHistoryItemDto {
  @ApiProperty({ description: "The command that was executed." })
  command!: string;

  @ApiProperty({
    description: "The output returned by the shell for this command.",
  })
  output!: string;
}
