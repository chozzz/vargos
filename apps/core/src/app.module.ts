import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { FunctionsController } from "./functions/functions.controller";
import { FunctionsService } from "./functions/functions.service";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
    }),
  ],
  controllers: [AppController, FunctionsController],
  providers: [AppService, FunctionsService],
})
export class AppModule {}
