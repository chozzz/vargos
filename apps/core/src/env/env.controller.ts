import { Controller, Get, Query, Param, Post, Body } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { EnvService } from "./env.service";
import { EnvSetDto } from "./dto/env-set.dto";
import { EnvVarDto } from "./dto/env-var.dto";
import { EnvSearchDto } from "./dto/env-search.dto";

@ApiTags("Env")
@Controller("env")
export class EnvController {
  constructor(private readonly envService: EnvService) {}

  @Get()
  @ApiOperation({ summary: "Search or list environment variables" })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search keyword for env variable key or value",
  })
  @ApiResponse({
    status: 200,
    description: "List of environment variables",
    type: [EnvVarDto],
  })
  search(@Query("search") search?: string): EnvVarDto[] {
    const result = this.envService.search(search || "");
    return Object.entries(result).map(([key, value]) => ({ key, value }));
  }

  @Get(":key")
  @ApiOperation({ summary: "Get a specific environment variable" })
  @ApiParam({ name: "key", description: "The environment variable key" })
  @ApiResponse({
    status: 200,
    description: "The environment variable",
    type: EnvVarDto,
  })
  get(@Param("key") key: string): EnvVarDto {
    const value = this.envService.get(key);
    return { key, value: value ?? "" };
  }

  @Post()
  @ApiOperation({ summary: "Set or update an environment variable" })
  @ApiBody({ type: EnvSetDto })
  @ApiResponse({
    status: 200,
    description: "Environment variable set successfully",
  })
  set(@Body() body: EnvSetDto) {
    this.envService.set(body.key, body.value);
    return { success: true, key: body.key, value: body.value };
  }
}
