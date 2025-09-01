import { Test, TestingModule } from "@nestjs/testing";
import { FunctionsTool } from "./functions.tool";
import { FunctionsController } from "./functions.controller";
import { FunctionsService } from "./functions.service";
import { Context } from "@rekog/mcp-nest";
import { Progress } from "@modelcontextprotocol/sdk/types";

describe("FunctionsTool", () => {
  let functionsTool: FunctionsTool;
  let functionsController: FunctionsController;
  let functionsService: FunctionsService;
  let mockContext: Context;

  const mockFunctionsService = {
    listFunctions: jest.fn(),
    indexFunction: jest.fn(),
    searchFunctions: jest.fn(),
    executeFunction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionsTool,
        FunctionsController,
        {
          provide: FunctionsService,
          useValue: mockFunctionsService,
        },
      ],
    }).compile();

    functionsTool = module.get<FunctionsTool>(FunctionsTool);
    functionsController = module.get<FunctionsController>(FunctionsController);
    functionsService = module.get<FunctionsService>(FunctionsService);

    // Mock context with progress reporting
    mockContext = {
      reportProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("reindexFunctions", () => {
    it("should successfully reindex all functions", async () => {
      const mockResult = {
        success: true,
        totalFunctions: 5,
      };
      
      jest.spyOn(functionsController, 'reindexFunctions').mockResolvedValue(mockResult);

      const result = await functionsTool.reindexFunctions({}, mockContext, {} as any);

      expect(functionsController.reindexFunctions).toHaveBeenCalled();
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
        totalFunctions: 5,
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        success: true,
        totalFunctions: 5,
      });
    });

    it("should handle reindex errors gracefully", async () => {
      const error = new Error("Reindex failed");
      
      jest.spyOn(functionsController, 'reindexFunctions').mockRejectedValue(error);

      const result = await functionsTool.reindexFunctions({}, mockContext, {} as any);

      expect(functionsController.reindexFunctions).toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({});
      expect(result.content[0]!.text).toContain("Failed to reindex functions");
      expect(result.content[0]!.text).toContain("Reindex failed");
    });
  });

  describe("searchFunctions", () => {
    it("should successfully search functions with query and limit", async () => {
      const query = "weather";
      const limit = 5;
      const mockResult = {
        functions: [
          { id: "func1", name: "getWeather", description: "Get weather info" },
          { id: "func2", name: "weatherForecast", description: "Weather forecast" },
        ],
        total: 2,
      };
      
      jest.spyOn(functionsController, 'searchFunctions').mockResolvedValue(mockResult);

      const result = await functionsTool.searchFunctions({ query, limit }, mockContext, {} as any);

      expect(functionsController.searchFunctions).toHaveBeenCalledWith(query, limit);
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(2);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        functions: [
          { id: "func1", name: "getWeather", description: "Get weather info" },
          { id: "func2", name: "weatherForecast", description: "Weather forecast" },
        ],
        total: 2,
      });
    });

    it("should use default limit when not provided", async () => {
      const query = "temperature";
      const mockResult = {
        functions: [
          { id: "func1", name: "getTemp", description: "Get temperature" },
        ],
        total: 1,
      };
      
      jest.spyOn(functionsController, 'searchFunctions').mockResolvedValue(mockResult);

      const result = await functionsTool.searchFunctions({ query }, mockContext, {} as any);

      expect(functionsController.searchFunctions).toHaveBeenCalledWith(query, 10);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        functions: [{ id: "func1", name: "getTemp", description: "Get temperature" }],
        total: 1,
      });
    });

    it("should handle search errors", async () => {
      const query = "error";
      const error = new Error("Search failed");
      
      jest.spyOn(functionsController, 'searchFunctions').mockRejectedValue(error);

      const result = await functionsTool.searchFunctions({ query }, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to search functions");
    });
  });

  describe("executeFunction", () => {
    it("should successfully execute a function", async () => {
      const functionId = "func123";
      const params = { city: "London", units: "metric" };
      const mockResult = { 
        result: { temperature: 20, condition: "sunny" },
        success: true 
      };
      
      jest.spyOn(functionsController, 'executeFunction').mockResolvedValue(mockResult);

      const result = await functionsTool.executeFunction({ functionId, params }, mockContext, {} as any);

      expect(functionsController.executeFunction).toHaveBeenCalledWith(functionId, params);
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(2);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        result: mockResult.result,
        success: true,
      });
    });

    it("should handle execution errors", async () => {
      const functionId = "errorFunc";
      const params = {};
      const error = new Error("Execution failed");
      
      jest.spyOn(functionsController, 'executeFunction').mockRejectedValue(error);

      const result = await functionsTool.executeFunction({ functionId, params }, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to execute function");
    });
  });

  describe("MCP response structure consistency", () => {
    it("should always return consistent MCP response format", async () => {
      const mockResult = { success: true, totalFunctions: 1 };
      
      jest.spyOn(functionsController, 'reindexFunctions').mockResolvedValue(mockResult);

      const result = await functionsTool.reindexFunctions({}, mockContext, {} as any);

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
  });
});
