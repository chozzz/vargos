import { ApiProperty } from "@nestjs/swagger";

export class EnvSetDto {
  @ApiProperty({
    description: "The environment variable key",
    example: "MY_VAR",
  })
  key!: string;

  @ApiProperty({
    description: "The value to set for the environment variable",
    example: "my_value",
  })
  value!: string;
}
