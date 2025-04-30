import { ApiProperty } from '@nestjs/swagger';

export class EnvVarDto {
  @ApiProperty({ description: 'The environment variable key', example: 'MY_VAR' })
  key!: string;

  @ApiProperty({ description: 'The value of the environment variable', example: 'my_value' })
  value!: string;
} 