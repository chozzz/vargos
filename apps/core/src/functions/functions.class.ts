import { ApiProperty } from "@nestjs/swagger";

export class FunctionMetadata {
  @ApiProperty({
    description: "Unique identifier for the function",
    type: String,
  })
  public id!: string;

  @ApiProperty({
    description: "Display name of the function",
    type: String,
  })
  public name!: string;

  @ApiProperty({
    description: "Category of the function",
    type: [String],
  })
  public category!: string[];

  @ApiProperty({
    description: "Detailed description of what the function does",
    type: String,
  })
  public description!: string;

  @ApiProperty({
    description: "Array of tags for categorizing and searching functions",
    type: [String],
  })
  public tags!: string[];

  @ApiProperty({
    description: "Required environment variables for the function to work",
    type: [String],
  })
  public requiredEnvVars!: string[];
}

export class FunctionListResponse {
  @ApiProperty({
    description: "Array of available functions",
    type: [FunctionMetadata],
  })
  public functions!: FunctionMetadata[];

  @ApiProperty({
    description: "Total number of functions",
    type: Number,
  })
  public total!: number;
}
