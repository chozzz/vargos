import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle("Vargos API")
    .setDescription(
      "API server for Vargos, responsible for managing functions, executing them, and exposing standardized APIs to LLM agents",
    )
    .setVersion("1.0")
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/swagger", app, documentFactory, {
    jsonDocumentUrl: "api/json",
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
