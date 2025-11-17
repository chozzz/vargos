import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
  Post,
  Body,
} from "@nestjs/common";
import { FunctionsService } from "./functions.service";
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiTags,
} from "@nestjs/swagger";
import {
  FunctionReindexResponseDto,
  FunctionSearchResponseDto,
  FunctionExecuteResponseDto,
} from "./dto/functions-response.dto";
import { FunctionExecuteDto } from "./dto/functions-execute.dto";

@ApiTags("Functions")
@Controller("functions")
export class FunctionsController {
  constructor(private readonly functionsService: FunctionsService) {}

  @Get("reindex")
  @ApiOperation({
    summary: "Reindex all functions",
    description: "Reindexes all functions from the functions directory",
  })
  @ApiResponse({
    status: 200,
    description: "Functions reindexed successfully",
    type: FunctionReindexResponseDto,
  })
  async reindexFunctions() {
    const functionMetas = await this.functionsService.listFunctions();
    await Promise.all(
      functionMetas.functions.map((functionMeta) =>
        this.functionsService.indexFunction(functionMeta),
      ),
    );
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
    type: FunctionSearchResponseDto,
  })
  async searchFunctions(
    @Query("query") query: string,
    @Optional()
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe)
    limit: number,
  ) {
    const result = await this.functionsService.searchFunctions(query, limit);
    // Transform service response to match tool expectation
    return {
      functions: result.map((item) => item.payload),
      total: result.length,
    };
  }

  @Post("execute")
  @ApiOperation({
    summary: "Execute a function",
    description: "Executes a function with the given parameters",
  })
  @ApiBody({ type: FunctionExecuteDto })
  @ApiResponse({
    status: 200,
    description: "Function executed successfully",
    type: FunctionExecuteResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid parameters or function execution failed",
  })
  async executeFunction(
    @Body() body: FunctionExecuteDto,
  ): Promise<{ result: unknown; success: boolean }> {
    const result = await this.functionsService.executeFunction(
      body.functionId,
      body.params || {},
    );
    return {
      result,
      success: true,
    };
  }
}
