import { createZodDto } from "nestjs-zod";
import { EnvSearchSchema } from "../../common/schemas/env.schemas";

export class EnvSearchDto extends createZodDto(EnvSearchSchema) {}
