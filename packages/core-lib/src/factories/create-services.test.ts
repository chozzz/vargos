import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { createCoreServices } from "./create-services";

describe("createCoreServices", () => {
  const testFunctionsDir = "/tmp/vargos-test-functions";
  const mockConfig = {
    llm: {
      provider: "openai" as const,
      config: { apiKey: "test-key" },
    },
    vector: {
      provider: "qdrant" as const,
      config: { url: "http://localhost", apiKey: "test-key", port: 6333 },
    },
    functions: {
      provider: "local-directory" as const,
      config: { functionsDir: testFunctionsDir },
    },
  };

  beforeEach(() => {
    // Create test functions directory
    if (!existsSync(testFunctionsDir)) {
      mkdirSync(testFunctionsDir, { recursive: true });
    }
    if (!existsSync(join(testFunctionsDir, "src"))) {
      mkdirSync(join(testFunctionsDir, "src"), { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testFunctionsDir)) {
      rmSync(testFunctionsDir, { recursive: true, force: true });
    }
  });

  it("should create all core services", async () => {
    // Mock Qdrant client to avoid connection errors
    vi.mock("@qdrant/js-client-rest", () => ({
      QdrantClient: vi.fn().mockImplementation(() => ({
        collectionExists: vi.fn().mockResolvedValue({ exists: false }),
        createCollection: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const services = await createCoreServices(mockConfig);
    expect(services.llmService).toBeDefined();
    expect(services.vectorService).toBeDefined();
    expect(services.functionsService).toBeDefined();
    expect(services.container).toBeDefined();
  });

  it("should create optional env service", async () => {
    vi.mock("@qdrant/js-client-rest", () => ({
      QdrantClient: vi.fn().mockImplementation(() => ({
        collectionExists: vi.fn().mockResolvedValue({ exists: false }),
        createCollection: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const services = await createCoreServices({
      ...mockConfig,
      env: { provider: "filepath" },
    });
    expect(services.envService).toBeDefined();
  });

  it("should create optional shell service", async () => {
    vi.mock("@qdrant/js-client-rest", () => ({
      QdrantClient: vi.fn().mockImplementation(() => ({
        collectionExists: vi.fn().mockResolvedValue({ exists: false }),
        createCollection: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const services = await createCoreServices({
      ...mockConfig,
      shell: {},
    });
    expect(services.shellService).toBeDefined();
  });
});

