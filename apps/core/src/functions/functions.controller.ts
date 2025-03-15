import { Controller, Get, Query } from "@nestjs/common";
import { FunctionsService } from "./functions.service";
import { FunctionListResponse } from "../common/classes/functions-metadata.class";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@Controller("functions")
export class FunctionsController {
  constructor(private readonly functionsService: FunctionsService) {}

  @Get()
  getDataDir(): string {
    return this.functionsService.getDataDir();
  }

  @Get("list")
  @ApiOperation({
    summary: "List available functions",
    description:
      "Returns a list of all available functions with their metadata including name, description, category, tags and required environment variables",
  })
  @ApiResponse({
    status: 200,
    description: "List of functions retrieved successfully",
    type: [FunctionListResponse],
  })
  async listFunctions(): Promise<FunctionListResponse> {
    return await this.functionsService.listFunctions();
  }

  @Get("reindex")
  async reindexFunctions() {
    return await this.functionsService.reindexFunctions();
  }
}
