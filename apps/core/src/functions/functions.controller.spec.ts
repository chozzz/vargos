import { Test, TestingModule } from "@nestjs/testing";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { VectorService } from "../vector/vector.service";
import { LLMService } from "../llm/llm.service";
import { FunctionListResponse } from "./dto/functions-list.dto";
import { FunctionMetadata } from "./dto/functions-metadata.dto";
import { VectorSearchResult } from "../common/interfaces/vector-db.interface";
import { LocalDirectoryProvider } from "./providers/local-directory.provider";

describe("FunctionsController", () => {
  let controller: FunctionsController;
  let service: FunctionsService;

  const mockFunctionMetadata: FunctionMetadata = {
    id: "test-function",
    name: "Test Function",
    description: "A test function",
    category: ["test"],
    tags: ["test", "example"],
    requiredEnvVars: ["TEST_VAR"],
    input: [],
    output: [],
  };

  const mockFunctionListResponse: FunctionListResponse = {
    functions: [mockFunctionMetadata],
    total: 1,
  };

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

  const mockLocalDirectoryProvider = {
    listFunctions: jest.fn(),
    getFunctionMetadata: jest.fn(),
    executeFunction: jest.fn(),
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
        {
          provide: LocalDirectoryProvider,
          useValue: mockLocalDirectoryProvider,
        },
      ],
    }).compile();

    controller = module.get<FunctionsController>(FunctionsController);
    service = module.get<FunctionsService>(FunctionsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("reindexFunctions", () => {
    it("should reindex all functions successfully", async () => {
      // Mock the service methods
      mockLocalDirectoryProvider.listFunctions.mockResolvedValue(mockFunctionListResponse);
      jest.spyOn(service, "indexFunction").mockResolvedValue(undefined);

      const result = await controller.reindexFunctions();

      expect(result).toEqual({
        success: true,
        totalFunctions: mockFunctionListResponse.functions.length,
      });
      expect(mockLocalDirectoryProvider.listFunctions).toHaveBeenCalledTimes(1);
      expect(service.indexFunction).toHaveBeenCalledTimes(mockFunctionListResponse.functions.length);
      expect(service.indexFunction).toHaveBeenCalledWith(mockFunctionMetadata);
    });

    it("should handle empty function list", async () => {
      const emptyResponse: FunctionListResponse = {
        functions: [],
        total: 0,
      };
      mockLocalDirectoryProvider.listFunctions.mockResolvedValue(emptyResponse);
      jest.spyOn(service, "indexFunction").mockResolvedValue(undefined);

      const result = await controller.reindexFunctions();

      expect(result).toEqual({
        success: true,
        totalFunctions: 0,
      });
      expect(mockLocalDirectoryProvider.listFunctions).toHaveBeenCalledTimes(1);
      expect(service.indexFunction).not.toHaveBeenCalled();
    });
  });

  describe("searchFunctions", () => {
    const mockSearchResults: VectorSearchResult[] = [
      {
        id: "test-function",
        score: 0.95,
        payload: mockFunctionMetadata,
      },
    ];

    beforeEach(() => {
      mockVectorService.search.mockResolvedValue(mockSearchResults);
    });

    it("should search functions with default limit", async () => {
      const query = "test query";
      const result = await controller.searchFunctions(query, 10);

      expect(result).toEqual({
        functions: mockSearchResults.map(item => item.payload),
        total: mockSearchResults.length,
      });
      expect(mockVectorService.search).toHaveBeenCalledWith(query, {
        collectionName: "vargos-functions-meta",
        limit: 10,
      });
    });

    it("should search functions with custom limit", async () => {
      const query = "test query";
      const limit = 5;
      const result = await controller.searchFunctions(query, limit);

      expect(result).toEqual({
        functions: mockSearchResults.map(item => item.payload),
        total: mockSearchResults.length,
      });
      expect(mockVectorService.search).toHaveBeenCalledWith(query, {
        collectionName: "vargos-functions-meta",
        limit,
      });
    });

    it("should handle empty search results", async () => {
      mockVectorService.search.mockResolvedValue([]);
      const query = "nonexistent query";
      const result = await controller.searchFunctions(query, 10);

      expect(result).toEqual({
        functions: [],
        total: 0,
      });
      expect(mockVectorService.search).toHaveBeenCalledWith(query, {
        collectionName: "vargos-functions-meta",
        limit: 10,
      });
    });
  });
});
