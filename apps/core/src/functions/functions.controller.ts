import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
  Logger,
} from "@nestjs/common";
import { FunctionsService } from "./functions.service";
import { FunctionListResponse } from "../common/classes/functions-list.class";
import { ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";

@Controller("functions")
export class FunctionsController {
  private readonly logger = new Logger(FunctionsController.name);
  constructor(private readonly functionsService: FunctionsService) {}

  @Get("reindex")
  @ApiOperation({
    summary: "Reindex all functions",
    description: "Reindexes all functions from the functions directory",
  })
  @ApiResponse({
    status: 200,
    description: "Functions reindexed successfully",
  })
  async reindexFunctions() {
    const functionMetas = await this.functionsService.listFunctions();
    this.logger.log(`Indexing ${functionMetas.functions.length} functions`);
    await Promise.all(
      functionMetas.functions.map((functionMeta) =>
        this.functionsService.indexFunction(functionMeta),
      ),
    );
    this.logger.log(`Indexed ${functionMetas.functions.length} functions`);
    return {
      success: true,
      totalFunctions: functionMetas.functions.length,
    };
  }

  @Get("search")
  @ApiOperation({
    summary: "Search for functions",
    description: "Searches for functions based on a query",
  })
  @ApiQuery({
    name: "query",
    description:
      "The query to search for (e.g. 'weather', 'temperature', 'forecast')",
    required: true,
  })
  @ApiQuery({
    name: "limit",
    description: "The maximum number of functions to return",
    default: 10,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "Functions found successfully",
    type: [FunctionListResponse],
  })
  async searchFunctions(
    @Query("query") query: string,
    @Optional()
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe)
    limit: number,
  ) {
    return await this.functionsService.searchFunctions(query, limit);
  }
}
