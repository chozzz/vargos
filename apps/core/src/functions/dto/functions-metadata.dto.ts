import { createZodDto } from "nestjs-zod";
import { FunctionMetadataSchema } from "@workspace/core-lib";

export class FunctionMetadata extends createZodDto(FunctionMetadataSchema) {}
