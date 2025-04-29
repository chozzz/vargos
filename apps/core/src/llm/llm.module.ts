import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LLMService } from "./llm.service";
import { LLMProvidersModule } from "./providers/providers.module";

@Module({
  imports: [ConfigModule, LLMProvidersModule],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
