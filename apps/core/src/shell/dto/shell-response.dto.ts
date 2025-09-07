import { createZodDto } from "nestjs-zod";
import {
  ShellExecuteResponseSchema,
  ShellHistoryResponseSchema,
  ShellInterruptResponseSchema,
} from "../../common/schemas/shell.schemas";

export class ShellExecuteResponseDto extends createZodDto(
  ShellExecuteResponseSchema,
) {}
export class ShellHistoryResponseDto extends createZodDto(
  ShellHistoryResponseSchema,
) {}
export class ShellInterruptResponseDto extends createZodDto(
  ShellInterruptResponseSchema,
) {}
