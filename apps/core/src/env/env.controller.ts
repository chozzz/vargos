import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
} from "@nestjs/swagger";
import { ZodValidationPipe } from 'nestjs-zod';
import { EnvService } from "./env.service";
import { 
  EnvSetDto, 
  EnvVarDto, 
  EnvSetResponseDto,
  EnvSearchDto, 
  EnvVarSchema,
  EnvSetResponseSchema
} from "./schemas/env.schema";
import { z } from "zod";
import { Tool } from "@rekog/mcp-nest";

@ApiTags("Env")
@Controller("env")
export class EnvController {
  private readonly logger = new Logger(EnvController.name);

  constructor(private readonly envService: EnvService) {}

  @Get()
  @ApiOperation({
    summary: "Search or list environment variables, censoring sensitive values",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search keyword for env variable key or value",
  })
  @ApiOkResponse({
    description: "List of environment variables",
    type: [EnvVarDto],
  })
  @Tool({
    name: 'search-env',
    description: 'Search for environment variables',
    parameters: z.object({
      search: z.string().optional().describe('Search keyword for env variable key or value'),
    }),
    outputSchema: z.array(EnvVarSchema),
  })
  search(@Query(new ZodValidationPipe()) query: EnvSearchDto): EnvVarDto[] {
    const result = this.envService.search(query.search || "", true);
    return Object.entries(result).map(([key, value]) => ({ key, value }));
  }

  @Get(":key")
  @ApiOperation({ summary: "Get a specific environment variable" })
  @ApiParam({ name: "key", description: "The environment variable key" })
  @ApiOkResponse({
    description: "The environment variable",
    type: EnvVarDto,
  })
  @Tool({
    name: 'get-env',
    description: 'Get an environment variable',
    parameters: z.object({
      key: z.string().describe('The environment variable key'),
    }),
    outputSchema: EnvVarSchema,
  })
  get(@Param("key") key: string): EnvVarDto {
    const value = this.envService.get(key);
    return { key, value: value ?? "" };
  }

  @Post()
  @ApiOperation({ summary: "Set or update an environment variable" })
  @ApiBody({ type: EnvSetDto })
  @ApiOkResponse({
    description: "Environment variable set successfully",
    type: EnvSetResponseDto,
  })
  @Tool({
    name: 'set-env',
    description: 'Set an environment variable',
    parameters: z.object({
      key: z.string().describe('The environment variable key'),
      value: z.string().describe('The value to set for the environment variable'),
    }),
    outputSchema: EnvSetResponseSchema,
  })
  set(@Body(new ZodValidationPipe()) body: EnvSetDto): EnvSetResponseDto {
    this.envService.set(body.key, body.value);
    return { success: true, key: body.key, value: body.value };
  }
}
