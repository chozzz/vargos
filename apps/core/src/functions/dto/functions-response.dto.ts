import { createZodDto } from "nestjs-zod";
import { 
  FunctionReindexResponseSchema, 
  FunctionSearchResponseSchema, 
  FunctionExecuteResponseSchema 
} from "../../common/schemas/functions.schemas";

export class FunctionReindexResponseDto extends createZodDto(FunctionReindexResponseSchema) {}
export class FunctionSearchResponseDto extends createZodDto(FunctionSearchResponseSchema) {}
export class FunctionExecuteResponseDto extends createZodDto(FunctionExecuteResponseSchema) {}
