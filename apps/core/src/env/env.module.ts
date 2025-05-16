import { Module } from "@nestjs/common";
import { EnvController } from "./env.controller";
import { EnvService } from "./env.service";
import { EnvProvidersModule } from "./providers/providers.module";

@Module({
  imports: [EnvProvidersModule],
  controllers: [EnvController],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
