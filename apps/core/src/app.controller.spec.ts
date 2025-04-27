import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { FunctionsController } from "./functions/functions.controller";
import { FunctionsService } from "./functions/functions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";

describe("AppController", () => {
  let appController: AppController;
  let functionsController: FunctionsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      controllers: [AppController, FunctionsController],
      providers: [
        AppService,
        FunctionsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const envVars: Record<string, string> = {
                FUNCTIONS_DIR: "/path/to/functions",
                DATA_DIR: "/path/to/data",
                QDRANT_HOST: "localhost",
                QDRANT_API_KEY: "test-key",
                OPENAI_API_KEY: "test-key",
                SERP_API_KEY: "test-key",
              };
              return envVars[key];
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    functionsController = app.get<FunctionsController>(FunctionsController);
  });

  describe("root", () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe("Hello World!");
    });
  });
});
