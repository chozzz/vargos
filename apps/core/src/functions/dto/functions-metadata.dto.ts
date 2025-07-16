import { createZodDto } from "nestjs-zod";
import { FunctionMetadataSchema } from "@vargos/core-lib";

export class FunctionMetadata extends createZodDto(FunctionMetadataSchema) {}
