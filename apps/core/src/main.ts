import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupSwagger } from "./config/swagger.config";
import { patchNestJsSwagger } from "nestjs-zod";

patchNestJsSwagger();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  // Setup Swagger
  setupSwagger(app, port);

  // Start the server
  await app.listen(port);
}

bootstrap();
