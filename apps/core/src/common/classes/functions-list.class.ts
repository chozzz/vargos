import { ApiProperty } from "@nestjs/swagger";
import { FunctionMetadata } from "./functions-metadata.class";

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
