import { createZodDto } from "nestjs-zod";
import { EnvVarSchema } from "../../common/schemas/env.schemas";

export class EnvVarDto extends createZodDto(EnvVarSchema) {}
