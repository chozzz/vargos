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

  describe("getEnvVar", () => {
    it("should successfully get an environment variable", async () => {
      const key = "TEST_KEY";
      const mockResult = { key: "TEST_KEY", value: "test_value" };
      
      jest.spyOn(envController, 'get').mockReturnValue(mockResult);

      const result = await envTool.getEnvVar({ key }, mockContext, {} as any);

      expect(envController.get).toHaveBeenCalledWith(key);
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
        success: true,
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        data: mockResult,
        success: true,
      });
    });

    it("should handle controller errors gracefully", async () => {
      const key = "ERROR_KEY";
      const error = new Error("Environment variable not found");
      
      jest.spyOn(envController, 'get').mockImplementation(() => {
        throw error;
      });

      const result = await envTool.getEnvVar({ key }, mockContext, {} as any);

      expect(envController.get).toHaveBeenCalledWith(key);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({});
      expect(result.content[0]!.text).toContain("Failed to get environment variable");
      expect(result.content[0]!.text).toContain("Environment variable not found");
    });

    it("should handle non-Error objects in error cases", async () => {
      const key = "ERROR_KEY";
      
      jest.spyOn(envController, 'get').mockImplementation(() => {
        throw "String error";
      });

      const result = await envTool.getEnvVar({ key }, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("String error");
    });
  });

  describe("setEnvVar", () => {
    it("should successfully set an environment variable", async () => {
      const key = "NEW_KEY";
      const value = "new_value";
      const mockResult = { success: true, key: "NEW_KEY", value: "new_value" };
      
      jest.spyOn(envController, 'set').mockReturnValue(mockResult);

      const result = await envTool.setEnvVar({ key, value }, mockContext, {} as any);

      expect(envController.set).toHaveBeenCalledWith({ key, value });
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
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        success: true,
        key: "NEW_KEY",
        value: "new_value",
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        success: true,
        key: "NEW_KEY",
        value: "new_value",
      });
    });

    it("should handle set operation errors", async () => {
      const key = "ERROR_KEY";
      const value = "error_value";
      const error = new Error("Set operation failed");
      
      jest.spyOn(envController, 'set').mockImplementation(() => {
        throw error;
      });

      const result = await envTool.setEnvVar({ key, value }, mockContext, {} as any);

      expect(envController.set).toHaveBeenCalledWith({ key, value });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to set environment variable");
      expect(result.content[0]!.text).toContain("Set operation failed");
    });
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
      expect(result.isError).toBe(false);
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

    it("should successfully search with empty keyword (list all)", async () => {
      const mockResult = [
        { key: "KEY1", value: "value1" },
        { key: "KEY2", value: "value2" },
      ];
      
      jest.spyOn(envController, 'search').mockReturnValue(mockResult);

      const result = await envTool.searchEnvVars({}, mockContext, {} as any);

      expect(envController.search).toHaveBeenCalledWith("");
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toHaveProperty("count", 2);
    });

    it("should successfully search with undefined keyword (list all)", async () => {
      const mockResult = [
        { key: "KEY1", value: "value1" },
        { key: "KEY2", value: "value2" },
      ];
      
      jest.spyOn(envController, 'search').mockReturnValue(mockResult);

      const result = await envTool.searchEnvVars({ keyword: undefined }, mockContext, {} as any);

      expect(envController.search).toHaveBeenCalledWith("");
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toHaveProperty("count", 2);
    });

    it("should handle search errors", async () => {
      const keyword = "ERROR";
      const error = new Error("Search failed");
      
      jest.spyOn(envController, 'search').mockImplementation(() => {
        throw error;
      });

      const result = await envTool.searchEnvVars({ keyword }, mockContext, {} as any);

      expect(envController.search).toHaveBeenCalledWith(keyword);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to search environment variables");
      expect(result.content[0]!.text).toContain("Search failed");
    });

    it("should handle empty search results", async () => {
      const keyword = "NONEXISTENT";
      const mockResult: Array<{ key: string; value: string }> = [];
      
      jest.spyOn(envController, 'search').mockReturnValue(mockResult);

      const result = await envTool.searchEnvVars({ keyword }, mockContext, {} as any);

      expect(envController.search).toHaveBeenCalledWith(keyword);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        data: [],
        count: 0,
      });
    });
  });



  describe("MCP response structure consistency", () => {
    it("should always return consistent MCP response format for tools", async () => {
      const key = "TEST_KEY";
      const mockResult = { key: "TEST_KEY", value: "test_value" };
      
      jest.spyOn(envController, 'get').mockReturnValue(mockResult);

      const result = await envTool.getEnvVar({ key }, mockContext, {} as any);

      // Verify the response structure
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("structuredContent");
      expect(result).toHaveProperty("isError");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content).toHaveLength(1);
      
      const contentItem = result.content[0];
      expect(contentItem).toBeDefined();
      expect(contentItem).toHaveProperty("type", "text");
      expect(contentItem).toHaveProperty("text");
    });

    it("should handle non-Error objects in error cases consistently", async () => {
      const key = "ERROR_KEY";
      
      jest.spyOn(envController, 'get').mockImplementation(() => {
        throw "String error";
      });

      const result = await envTool.getEnvVar({ key }, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({});
      expect(result.content[0]!.text).toContain("String error");
    });
  });
});
