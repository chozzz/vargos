import { createZodDto } from "nestjs-zod";
import { FunctionMetadataSchema } from "../../common/schemas/functions.schemas";

export class FunctionMetadata extends createZodDto(FunctionMetadataSchema) {}
