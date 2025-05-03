import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { LLMService } from "./llm.service";
import { OpenAIProvider } from "./providers/openai.provider";

// Mock OpenAI
const mockOpenAIClient = {
  embeddings: {
    create: jest.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }),
  },
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "test response",
              role: "assistant",
            },
          },
        ],
      }),
    },
  },
};

// Mock the OpenAI class
jest.mock("openai", () => {
  return {
    default: jest.fn().mockImplementation(() => mockOpenAIClient),
    __esModule: true,
  };
});

describe("LLMService", () => {
  let module: TestingModule;
  let service: LLMService;
  let openAIProvider: OpenAIProvider;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        "llm.openai.apiKey": "test-key",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        LLMService,
        OpenAIProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
    openAIProvider = module.get<OpenAIProvider>(OpenAIProvider);

    // Mock the client property directly
    (openAIProvider as unknown as { client: typeof mockOpenAIClient }).client =
      mockOpenAIClient;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("initialization", () => {
    it("should not initialize the provider directly", async () => {
      // Create spy on initialize method to track when it's called
      const initializeSpy = jest.spyOn(openAIProvider, "initialize");

      // Initialize the NestJS application, which triggers all OnModuleInit lifecycle hooks
      const app = module.createNestApplication();
      await app.init();

      // Verify that initialize was called exactly once by the provider's OnModuleInit
      // This ensures the service isn't triggering additional initializations
      expect(initializeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
