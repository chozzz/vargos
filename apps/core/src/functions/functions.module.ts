import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { LLMModule } from "../llm/llm.module";
import { VectorModule } from "../vector/vector.module";
import { FunctionsProvidersModule } from "./providers/providers.module";

@Module({
  imports: [ConfigModule, LLMModule, VectorModule, FunctionsProvidersModule],
  controllers: [FunctionsController],
  providers: [FunctionsService],
  exports: [FunctionsService],
})
export class FunctionsModule {}
