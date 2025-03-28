import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { VectorService } from "./vector.service";
import { QdrantProvider } from "./providers/qdrant.provider";
import { LLMService } from "../llm/llm.service";
import { QdrantClient } from "@qdrant/js-client-rest";

// Mock QdrantClient
const mockQdrantClient = {
  api: jest.fn().mockReturnValue({
    collectionExists: jest.fn().mockResolvedValue({ data: { result: { exists: true } } }),
  }),
};

jest.mock("@qdrant/js-client-rest", () => {
  return {
    QdrantClient: jest.fn().mockImplementation(() => mockQdrantClient),
  };
});

describe("VectorService", () => {
  let module: TestingModule;
  let service: VectorService;
  let qdrantProvider: QdrantProvider;
  let llmService: LLMService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string | number> = {
        "vector.qdrant.url": "http://localhost",
        "vector.qdrant.apiKey": "test-key",
        "vector.qdrant.port": 6333,
      };
      return config[key];
    }),
  };

  const mockLLMService = {
    generateEmbedding: jest.fn(),
    generateEmbeddings: jest.fn(),
    chat: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        VectorService,
        QdrantProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    service = module.get<VectorService>(VectorService);
    qdrantProvider = module.get<QdrantProvider>(QdrantProvider);
    llmService = module.get<LLMService>(LLMService);

    // Mock the client property directly
    (qdrantProvider as any).client = mockQdrantClient;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("initialization", () => {
    it("should not initialize the provider directly", async () => {
      // Create spy on initialize method to track when it's called
      const initializeSpy = jest.spyOn(qdrantProvider, "initialize");

      // Initialize the NestJS application, which triggers all OnModuleInit lifecycle hooks
      const app = module.createNestApplication();
      await app.init();

      // Verify that initialize was called exactly once by the provider's OnModuleInit
      // This ensures the service isn't triggering additional initializations
      expect(initializeSpy).toHaveBeenCalledTimes(1);
    });
  });
}); 