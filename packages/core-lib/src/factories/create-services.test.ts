import { createCoreServices } from "./create-services";

describe("createCoreServices", () => {
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
      config: { functionsDir: "/tmp/test-functions" },
    },
  };

  it("should create all core services", async () => {
    const services = await createCoreServices(mockConfig);
    expect(services.llmService).toBeDefined();
    expect(services.vectorService).toBeDefined();
    expect(services.functionsService).toBeDefined();
    expect(services.container).toBeDefined();
  });

  it("should create optional env service", async () => {
    const services = await createCoreServices({
      ...mockConfig,
      env: { provider: "filepath" },
    });
    expect(services.envService).toBeDefined();
  });

  it("should create optional shell service", async () => {
    const services = await createCoreServices({
      ...mockConfig,
      shell: {},
    });
    expect(services.shellService).toBeDefined();
  });
});

