/**
 * Integration tests for Vargos Core-Lib services
 *
 * These tests verify that core-lib services are properly initialized
 * and accessible to LangChain agents.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  initializeVargosCoreServices,
  getVargosCoreServices,
  resetVargosCoreServices,
} from "../services/vargos-core";

describe("Vargos Core Services Integration", () => {
  beforeAll(async () => {
    // Reset any existing instance
    resetVargosCoreServices();

    // Initialize fresh instance for tests
    await initializeVargosCoreServices();
  });

  it("should initialize core services successfully", async () => {
    const services = getVargosCoreServices();

    expect(services).toBeDefined();
    expect(services.llmService).toBeDefined();
    expect(services.vectorService).toBeDefined();
    expect(services.functionsService).toBeDefined();
  });

  it("should return same instance on multiple calls", async () => {
    const services1 = getVargosCoreServices();
    const services2 = await initializeVargosCoreServices(); // Should return existing

    expect(services1).toBe(services2);
  });

  it("should have functional LLM service", async () => {
    const { llmService } = getVargosCoreServices();

    const embedding = await llmService.generateEmbeddings("test");

    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
  });

  it("should have functional functions service", async () => {
    const { functionsService } = getVargosCoreServices();

    const functions = await functionsService.listFunctions();

    expect(functions).toBeDefined();
    expect(functions.functions).toBeDefined();
    expect(Array.isArray(functions.functions)).toBe(true);
  });

  it("should have functional vector service", async () => {
    const { vectorService } = getVargosCoreServices();

    // This should not throw
    expect(() => vectorService).not.toThrow();
  });

  it("should have optional env service", () => {
    const { envService } = getVargosCoreServices();

    // Env service is optional but should be initialized if configured
    if (process.env.ENV_FILE_PATH) {
      expect(envService).toBeDefined();
    }
  });

  it("should have optional shell service", () => {
    const { shellService } = getVargosCoreServices();

    // Shell service is optional but should be initialized if configured
    if (process.env.DATA_DIR) {
      expect(shellService).toBeDefined();
    }
  });

  it("should throw error when accessing services before initialization", () => {
    resetVargosCoreServices();

    expect(() => getVargosCoreServices()).toThrow(
      "Vargos Core Services not initialized"
    );

    // Re-initialize for other tests
    return initializeVargosCoreServices();
  });
});
