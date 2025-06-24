import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { FunctionsModule } from "./functions/functions.module";
import { LLMModule } from "./llm/llm.module";
import { VectorModule } from "./vector/vector.module";
import configuration from "./config/configuration";
import { ShellModule } from "./shell/shell.module";
import { EnvModule } from "./env/env.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LLMModule,
    VectorModule,
    ShellModule,
    EnvModule,
    FunctionsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
