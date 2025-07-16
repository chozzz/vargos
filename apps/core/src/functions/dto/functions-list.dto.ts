import { createZodDto } from "nestjs-zod";
import { FunctionListResponseSchema } from "@vargos/core-lib";

export class FunctionListResponse extends createZodDto(
  FunctionListResponseSchema,
) {}
