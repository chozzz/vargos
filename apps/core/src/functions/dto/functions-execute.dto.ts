import { createZodDto } from "nestjs-zod";
import { FunctionExecuteRequestSchema } from "@workspace/core-lib";

export class FunctionExecuteDto extends createZodDto(
  FunctionExecuteRequestSchema,
) {}

