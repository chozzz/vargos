import { createZodDto } from "nestjs-zod";
import { EnvSetSchema } from "../../common/schemas/env.schemas";

export class EnvSetDto extends createZodDto(EnvSetSchema) {}
