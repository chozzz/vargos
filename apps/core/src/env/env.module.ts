import { Module } from "@nestjs/common";
import { EnvController } from "./env.controller";
import { EnvService } from "./env.service";
import { EnvProvidersModule } from "./providers/providers.module";
import { EnvTool } from "./env.tool";

@Module({
  imports: [EnvProvidersModule],
  controllers: [EnvController],
  providers: [EnvService, EnvController, EnvTool],
  exports: [EnvService, EnvController, EnvTool],
})
export class EnvModule {}
