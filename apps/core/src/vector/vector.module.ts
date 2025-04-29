import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VectorService } from "./vector.service";
import { LLMModule } from "../llm/llm.module";
import { VectorProvidersModule } from "./providers/providers.module";

@Module({
  imports: [ConfigModule, LLMModule, VectorProvidersModule],
  providers: [VectorService],
  exports: [VectorService],
})
export class VectorModule {}
