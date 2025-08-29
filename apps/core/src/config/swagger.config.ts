import { INestApplication, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

export function setupSwagger(app: INestApplication, port: number | string) {
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
    customCss: `
      @media (prefers-color-scheme: dark) {
        body { background: #000000; }
        .swagger-ui .topbar { background: #000000; color: #ffffff; }
        div.swagger-ui *:not([class*="opblock"]) * { filter: invert(100%) hue-rotate(180deg); }
        div.swagger-ui [class*="opblock"] { filter: invert(100%) hue-rotate(180deg); }
      }
    `,
    customSiteTitle: "Vargos API Documentation",
    customfavIcon: "/favicon.ico",
  });

  setTimeout(() => {
    // I just want this log to be printed after the server is ready
    Logger.verbose(
      `Swagger UI is available at: http://localhost:${port}/api/swagger`,
      "Swagger",
    );
    Logger.verbose(
      `Swagger JSON is available at: http://localhost:${port}/api/json`,
      "Swagger",
    );
  }, 1e3);
}
