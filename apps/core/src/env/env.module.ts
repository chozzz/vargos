import { Module } from "@nestjs/common";
import { EnvController } from "./env.controller";
import { EnvService } from "./env.service";

@Module({
  controllers: [EnvController],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
