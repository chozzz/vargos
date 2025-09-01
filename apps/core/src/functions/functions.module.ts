import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { FunctionsTool } from "./functions.tool";
import { LLMModule } from "../llm/llm.module";
import { VectorModule } from "../vector/vector.module";
import { FunctionsProvidersModule } from "./providers/providers.module";
import { LocalDirectoryProvider } from "./providers/local-directory.provider";
import { ParseJsonPipe } from "../common/pipes/parse-json.pipe";

@Module({
  imports: [ConfigModule, LLMModule, VectorModule, FunctionsProvidersModule],
  controllers: [FunctionsController],
  providers: [
    FunctionsService,
    LocalDirectoryProvider,
    ParseJsonPipe,
    FunctionsTool,
    FunctionsController,
  ],
  exports: [FunctionsService, ParseJsonPipe],
})
export class FunctionsModule {}
