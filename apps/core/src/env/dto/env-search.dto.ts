import { ApiPropertyOptional } from "@nestjs/swagger";

export class EnvSearchDto {
  @ApiPropertyOptional({
    description: "Search keyword for env variable key or value",
    example: "API_KEY",
  })
  search?: string;
}
