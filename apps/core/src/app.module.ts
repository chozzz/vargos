import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { FunctionsController } from "./functions/functions.controller";

@Module({
  imports: [],
  controllers: [AppController, FunctionsController],
  providers: [AppService],
})
export class AppModule {}
