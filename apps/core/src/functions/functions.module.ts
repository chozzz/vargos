import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { LLMModule } from "../llm/llm.module";
import { VectorModule } from "../vector/vector.module";

@Module({
  imports: [ConfigModule, LLMModule, VectorModule],
  controllers: [FunctionsController],
  providers: [FunctionsService],
  exports: [FunctionsService],
})
export class FunctionsModule {}
