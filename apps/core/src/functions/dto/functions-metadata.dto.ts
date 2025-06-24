import { ApiProperty } from "@nestjs/swagger";

class FunctionInput {
  @ApiProperty({
    description:
      "The identifier or label used to reference this input parameter in the function",
    type: String,
  })
  public name!: string;

  @ApiProperty({
    description:
      "The data type that this input parameter accepts (e.g. string, number, boolean, object)",
    type: String,
  })
  public type!: string;

  @ApiProperty({
    description:
      "A detailed explanation of what this input parameter is used for and any constraints or requirements",
    type: String,
  })
  public description!: string;

  @ApiProperty({
    description:
      "The fallback value that will be used if no value is provided for this input parameter",
    type: String,
  })
  public defaultValue!: string;
}

class FunctionOutput {
  @ApiProperty({
    description:
      "The identifier or label used to reference this output value from the function",
    type: String,
  })
  public name!: string;

  @ApiProperty({
    description:
      "The data type that this output value will return (e.g. string, number, boolean, object)",
    type: String,
  })
  public type!: string;
}

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

  public input!: FunctionInput[];
  public output!: FunctionOutput[];
}
