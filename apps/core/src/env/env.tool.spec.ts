import { Test, TestingModule } from "@nestjs/testing";
import { EnvTool } from "./env.tool";
import { EnvController } from "./env.controller";
import { EnvService } from "./env.service";
import { Context } from "@rekog/mcp-nest";
import { Progress } from "@modelcontextprotocol/sdk/types";

describe("EnvTool", () => {
  let envTool: EnvTool;
  let envController: EnvController;
  let envService: EnvService;
  let mockContext: Context;

  const mockEnvService = {
    get: jest.fn(),
    set: jest.fn(),
    search: jest.fn(),
    getAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvTool,
        EnvController,
        {
          provide: EnvService,
          useValue: mockEnvService,
        },
      ],
    }).compile();

    envTool = module.get<EnvTool>(EnvTool);
    envController = module.get<EnvController>(EnvController);
    envService = module.get<EnvService>(EnvService);

    // Mock context with progress reporting
    mockContext = {
      reportProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("searchEnvVars", () => {
    it("should successfully search environment variables with keyword", async () => {
      const keyword = "TEST";
      const mockResult = [
        { key: "TEST_KEY1", value: "value1" },
        { key: "TEST_KEY2", value: "value2" },
      ];
      
      jest.spyOn(envController, 'search').mockReturnValue(mockResult);

      const result = await envTool.searchEnvVars({ keyword }, mockContext, {} as any);

      expect(envController.search).toHaveBeenCalledWith(keyword);
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(2);
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(1, {
        progress: 50,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(2, {
        progress: 100,
        total: 100,
      });
      
      // Verify MCP response structure
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("structuredContent");
      expect(result).toHaveProperty("isError");
      expect(result.isError).toBe(false);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty("type", "text");
      expect(result.content[0]).toHaveProperty("text");
      
      // Verify structured content
      expect(result.structuredContent).toEqual({
        data: mockResult,
        count: 2,
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        data: mockResult,
        count: 2,
      });
    });
  });
});
