import { Test, TestingModule } from "@nestjs/testing";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";
import { FunctionListResponse } from "../common/classes/functions-list.class";

describe("FunctionsController", () => {
  let controller: FunctionsController;
  let service: FunctionsService;

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
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      controllers: [FunctionsController],
      providers: [
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

    controller = module.get<FunctionsController>(FunctionsController);
    service = module.get<FunctionsService>(FunctionsService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should return list of functions", async () => {
    const mockFunctions = {
      functions: [
        {
          id: "web-search",
          name: "Web Search",
          category: "Search",
          description: "Performs web searches using SERP API",
          tags: ["search", "web"],
          requiredEnvVars: ["SERP_API_KEY"],
        },
      ],
      total: 1,
    };

    jest
      .spyOn(service, "listFunctions")
      .mockResolvedValue(mockFunctions as unknown as FunctionListResponse);
    const result = await controller.listFunctions();
    expect(result).toBe(mockFunctions);
  });
});
