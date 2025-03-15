import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { FunctionsController } from "./functions/functions.controller";
import { FunctionsService } from "./functions/functions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { VectorService } from "./vector/vector.service";
import { LLMService } from "./llm/llm.service";

describe("AppController", () => {
  let appController: AppController;
  let functionsController: FunctionsController;
  let appService: AppService;

  const mockVectorService = {
    search: jest.fn(),
    index: jest.fn(),
    delete: jest.fn(),
    createCollection: jest.fn(),
    collectionExists: jest.fn(),
  };

  const mockLLMService = {
    generateEmbedding: jest.fn(),
    generateEmbeddings: jest.fn(),
    chat: jest.fn(),
  };

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
        {
          provide: VectorService,
          useValue: mockVectorService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    functionsController = app.get<FunctionsController>(FunctionsController);
    appService = app.get<AppService>(AppService);
  });

  describe("root", () => {
    it('should return "pong"', () => {
      expect(appController.ping()).toBe("pong");
    });
  });
});
