import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupSwagger } from "./config/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.CORE_PORT ?? 4861;

  // Setup Swagger
  setupSwagger(app, port);

  // Start the server
  await app.listen(port);
}

bootstrap();
