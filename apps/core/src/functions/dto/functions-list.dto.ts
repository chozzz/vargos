import { createZodDto } from "nestjs-zod";
import { FunctionListResponseSchema } from "@workspace/core-lib";

export class FunctionListResponse extends createZodDto(
  FunctionListResponseSchema,
) {}
