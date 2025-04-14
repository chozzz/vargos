import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LocalDirectoryProvider } from "./local-directory.provider";

@Module({
  imports: [ConfigModule],
  providers: [LocalDirectoryProvider],
  exports: [LocalDirectoryProvider],
})
export class FunctionsProvidersModule {}
