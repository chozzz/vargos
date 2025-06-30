import { createZodDto } from "nestjs-zod";
import {
  ShellExecuteSchema,
  ShellHistoryItemSchema,
} from "../../common/schemas/shell.schemas";

export class ShellExecuteDto extends createZodDto(ShellExecuteSchema) {}

export class ShellHistoryItemDto extends createZodDto(ShellHistoryItemSchema) {}
