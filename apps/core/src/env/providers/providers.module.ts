import { Module } from "@nestjs/common";
import { EnvFilepathProvider } from "./env-filepath.provider";

@Module({
  providers: [EnvFilepathProvider],
  exports: [EnvFilepathProvider],
})
export class EnvProvidersModule {}
