import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
  Logger,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { FunctionsService } from "./functions.service";
import { FunctionListResponse } from "./dto/functions-list.dto";
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
    type: FunctionReindexResponseDto,
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
    if (!body.functionId) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: "ValidationError",
          message: "functionId is required in request body",
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const result = await this.functionsService.executeFunction(
        body.functionId,
        body.params || {},
      );
      // Wrap service response to match tool expectation
      return {
        result,
        success: true,
      };
    } catch (serviceError) {
      if (
        typeof serviceError === "object" &&
        serviceError !== null &&
        "error" in serviceError &&
        "message" in serviceError
      ) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: (serviceError as any).error,
            message: (serviceError as any).message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: "UnknownError",
          message:
            typeof serviceError === "string" ? serviceError : "Unknown error",
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
