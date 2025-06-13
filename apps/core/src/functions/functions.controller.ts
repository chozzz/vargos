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
  Param,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { FunctionsService } from "./functions.service";
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiTags,
  ApiOkResponse,
} from "@nestjs/swagger";
import { Tool } from '@rekog/mcp-nest';
import { ParseJsonPipe } from "../common/pipes/parse-json.pipe";
import z from "zod";
import { FunctionListResponseDto, FunctionListResponseSchema } from "./schemas/functions.schema";

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
  })
  @Tool({
    name: 'reindex-functions',
    description:
      'Reindex all functions'
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
  @ApiOkResponse({
    description: "Functions found successfully",
    type: [FunctionListResponseDto],
  })
  @Tool({
    name: 'search-functions',
    description:
      'Search for functions',
    parameters: z.object({
      query: z.string().describe('The query to search for (e.g. "weather", "temperature", "forecast")'),
      limit: z.number().optional().describe('The maximum number of functions to return'),
    }),
    outputSchema: FunctionListResponseSchema,
  })
  async searchFunctions(
    @Query("query") query: string,
    @Optional()
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe)
    limit: number,
  ) {
    return await this.functionsService.searchFunctions(query, limit);
  }

  @Post(":functionId/execute")
  @ApiOperation({
    summary: "Execute a function",
    description: "Executes a function with the given parameters",
  })
  @ApiParam({
    name: "functionId",
    description: "The ID of the function to execute",
    required: true,
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        params: { type: "object" },
      },
    },
  })
  @ApiOkResponse({
    description: "Function executed successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Invalid parameters or function execution failed",
  })
  @Tool({
    name: 'execute-function',
    description: 'Execute a function',
    parameters: z.object({
      functionId: z.string().describe('The ID of the function to execute'),
      params: z.object({}).describe('The parameters to pass to the function'),
    }),
    outputSchema: z.any(),
  })
  async executeFunction(
    @Param("functionId") functionId: string,
    @Body(new ParseJsonPipe()) params: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.functionsService.executeFunction(functionId, params);
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
