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
import { McpModule } from '@rekog/mcp-nest';

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
    FunctionsModule,
    McpModule.forRoot({
      name: 'vargos-core-mcp-server',
      version: '1.0.0',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
