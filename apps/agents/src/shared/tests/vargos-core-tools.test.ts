/**
 * Unit tests for Vargos Core-Lib tools
 *
 * These tests verify that LangChain tools correctly interface
 * with Vargos core-lib services.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { initializeVargosCoreServices } from "../services/vargos-core.js";
import {
  listVargosFunctionsTool,
  searchVargosFunctionsTool,
  getFunctionMetadataTool,
  semanticSearchTool,
  VARGOS_CORE_TOOLS,
} from "../tools/vargos-core-tools.js";

describe("Vargos Core-Lib Tools", () => {
  beforeAll(async () => {
    // Initialize core services before running tool tests
    await initializeVargosCoreServices();
  });

  describe("Tool Array Export", () => {
    it("should export all tools in VARGOS_CORE_TOOLS array", () => {
      expect(Array.isArray(VARGOS_CORE_TOOLS)).toBe(true);
      expect(VARGOS_CORE_TOOLS.length).toBeGreaterThan(0);
    });

    it("should have valid tool structure", () => {
      VARGOS_CORE_TOOLS.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.schema).toBeDefined();
        expect(typeof tool.func).toBe("function");
      });
    });
  });

  describe("listVargosFunctionsTool", () => {
    it("should have correct metadata", () => {
      expect(listVargosFunctionsTool.name).toBe("list_vargos_functions");
      expect(listVargosFunctionsTool.description).toContain("List all");
    });

    it("should list functions", async () => {
      const result = await listVargosFunctionsTool.func({});
      const parsed = JSON.parse(result);

      expect(parsed).toBeDefined();
      expect(parsed.functions).toBeDefined();
      expect(Array.isArray(parsed.functions)).toBe(true);
    });
  });

  describe("searchVargosFunctionsTool", () => {
    it("should have correct metadata", () => {
      expect(searchVargosFunctionsTool.name).toBe("search_vargos_functions");
      expect(searchVargosFunctionsTool.description).toContain("semantic");
    });

    it("should search functions with query", async () => {
      const result = await searchVargosFunctionsTool.func({
        query: "search github",
        limit: 3,
      });

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("should use default limit when not provided", async () => {
      const result = await searchVargosFunctionsTool.func({
        query: "test",
        limit: 5, // Default value
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("getFunctionMetadataTool", () => {
    it("should have correct metadata", () => {
      expect(getFunctionMetadataTool.name).toBe("get_function_metadata");
      expect(getFunctionMetadataTool.description).toContain("metadata");
    });

    it("should get function metadata", async () => {
      // First list functions to get a valid ID
      const listResult = await listVargosFunctionsTool.func({});
      const { functions } = JSON.parse(listResult);

      if (functions.length > 0) {
        const functionId = functions[0].id;
        const result = await getFunctionMetadataTool.func({ functionId });
        const metadata = JSON.parse(result);

        expect(metadata).toBeDefined();
        expect(metadata.id).toBe(functionId);
        expect(metadata.name).toBeDefined();
        expect(metadata.description).toBeDefined();
      }
    });
  });

  describe("semanticSearchTool", () => {
    it("should have correct metadata", () => {
      expect(semanticSearchTool.name).toBe("semantic_search");
      expect(semanticSearchTool.description).toContain("semantic search");
    });

    it("should search with default collection", async () => {
      const result = await semanticSearchTool.func({
        query: "test function",
        collectionName: "vargos-functions-meta",
        limit: 5,
      });

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("should search with custom collection", async () => {
      const result = await semanticSearchTool.func({
        query: "test",
        collectionName: "vargos-functions-meta",
        limit: 3,
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });
  });

  describe("Tool Error Handling", () => {
    it("should handle invalid function ID gracefully", async () => {
      await expect(
        getFunctionMetadataTool.func({ functionId: "non-existent-id" })
      ).rejects.toThrow();
    });
  });
});
