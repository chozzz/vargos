import { Test, TestingModule } from "@nestjs/testing";
import { ShellTool } from "./shell.tool";
import { ShellController } from "./shell.controller";
import { ShellService } from "./shell.service";
import { Context } from "@rekog/mcp-nest";
import { Progress } from "@modelcontextprotocol/sdk/types";

describe("ShellTool", () => {
  let shellTool: ShellTool;
  let shellController: ShellController;
  let shellService: ShellService;
  let mockContext: Context;

  const mockShellService = {
    execute: jest.fn(),
    getHistory: jest.fn(),
    interrupt: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellTool,
        ShellController,
        {
          provide: ShellService,
          useValue: mockShellService,
        },
      ],
    }).compile();

    shellTool = module.get<ShellTool>(ShellTool);
    shellController = module.get<ShellController>(ShellController);
    shellService = module.get<ShellService>(ShellService);

    // Mock context with progress reporting
    mockContext = {
      reportProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("should successfully execute a shell command", async () => {
      const command = "ls -la";
      const mockResult = {
        command: "ls -la",
        output: "total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .\ndrwxr-xr-x 3 user user 4096 Jan 1 00:00 ..",
      };
      
      jest.spyOn(shellController, 'execute').mockResolvedValue(mockResult);

      const result = await shellTool.execute({ command }, mockContext, {} as any);

      expect(shellController.execute).toHaveBeenCalledWith({ command });
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
        command: "ls -la",
        output: "total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .\ndrwxr-xr-x 3 user user 4096 Jan 1 00:00 ..",
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        command: "ls -la",
        output: "total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .\ndrwxr-xr-x 3 user user 4096 Jan 1 00:00 ..",
      });
    });

    it("should handle execution errors gracefully", async () => {
      const command = "invalid-command";
      const error = new Error("Command not found");
      
      jest.spyOn(shellController, 'execute').mockRejectedValue(error);

      const result = await shellTool.execute({ command }, mockContext, {} as any);

      expect(shellController.execute).toHaveBeenCalledWith({ command });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({});
      expect(result.content[0]!.text).toContain("Failed to execute shell command");
      expect(result.content[0]!.text).toContain("Command not found");
    });
  });

  describe("getHistory", () => {
    it("should successfully get shell command history", async () => {
      const mockResult = [
        { command: "ls", output: "file1.txt\nfile2.txt" },
        { command: "pwd", output: "/home/user" },
        { command: "echo hello", output: "hello" },
      ];
      
      jest.spyOn(shellController, 'getHistory').mockReturnValue(mockResult);

      const result = await shellTool.getHistory({}, mockContext, {} as any);

      expect(shellController.getHistory).toHaveBeenCalled();
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
      expect(result.structuredContent).toEqual({ history: mockResult });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({ history: mockResult });
    });

    it("should handle empty history", async () => {
      const mockResult: Array<{ command: string; output: string }> = [];
      
      jest.spyOn(shellController, 'getHistory').mockReturnValue(mockResult);

      const result = await shellTool.getHistory({}, mockContext, {} as any);

      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({ history: [] });
    });

    it("should handle history retrieval errors", async () => {
      const error = new Error("History retrieval failed");
      
      jest.spyOn(shellController, 'getHistory').mockImplementation(() => {
        throw error;
      });

      const result = await shellTool.getHistory({}, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to get shell history");
      expect(result.content[0]!.text).toContain("History retrieval failed");
    });
  });

  describe("interrupt", () => {
    it("should successfully interrupt shell command", async () => {
      const mockResult = {
        success: true,
        message: "Interrupt signal sent to shell.",
      };
      
      jest.spyOn(shellController, 'interrupt').mockResolvedValue(mockResult);

      const result = await shellTool.interrupt({}, mockContext, {} as any);

      expect(shellController.interrupt).toHaveBeenCalled();
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
        message: "Interrupt signal sent to shell.",
      });
      
      // Verify text content is JSON stringified
      const textContent = JSON.parse(result.content[0]!.text);
      expect(textContent).toEqual({
        success: true,
        message: "Interrupt signal sent to shell.",
      });
    });

    it("should handle interrupt errors", async () => {
      const error = new Error("Interrupt failed");
      
      jest.spyOn(shellController, 'interrupt').mockRejectedValue(error);

      const result = await shellTool.interrupt({}, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Failed to interrupt shell command");
    });
  });

  describe("MCP response structure consistency", () => {
    it("should always return consistent MCP response format", async () => {
      const mockResult = { success: true, message: "Interrupt signal sent to shell." };
      
      jest.spyOn(shellController, 'interrupt').mockResolvedValue(mockResult);

      const result = await shellTool.interrupt({}, mockContext, {} as any);

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
      const command = "error-command";
      
      jest.spyOn(shellController, 'execute').mockImplementation(() => {
        throw "String error";
      });

      const result = await shellTool.execute({ command }, mockContext, {} as any);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({});
      expect(result.content[0]!.text).toContain("String error");
    });
  });
});
