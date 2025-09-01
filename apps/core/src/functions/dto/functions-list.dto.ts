import { createZodDto } from "nestjs-zod";
import { FunctionListResponseSchema } from "../../common/schemas/functions.schemas";

export class FunctionListResponse extends createZodDto(
  FunctionListResponseSchema,
) {}
