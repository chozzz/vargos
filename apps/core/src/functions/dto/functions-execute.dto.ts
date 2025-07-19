import { createZodDto } from "nestjs-zod";
import { FunctionExecuteRequestSchema } from "@vargos/core-lib";

export class FunctionExecuteDto extends createZodDto(
  FunctionExecuteRequestSchema,
) {}

