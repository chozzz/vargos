import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ZodValidationPipe } from "nestjs-zod";
import { AppModule } from "./app.module";
import { setupSwagger } from "./config/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.CORE_PORT ?? 4861;

  // Enable Zod validation globally for Zod DTOs
  // This works with nestjs-zod DTOs created with createZodDto
  app.useGlobalPipes(new ZodValidationPipe());

  // Setup Swagger
  setupSwagger(app, port);

  // Start the server
  await app.listen(port);
}

bootstrap();
