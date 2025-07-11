import { EnvService } from "./env.service";
import { EnvProvider } from "./interfaces/env.interface";

describe("EnvService", () => {
  let mockProvider: jest.Mocked<EnvProvider>;
  let service: EnvService;

  beforeEach(() => {
    mockProvider = {
      initialize: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockReturnValue({ KEY: "value", SECRET: "secret123" }),
      write: jest.fn(),
      search: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };
    service = new EnvService(mockProvider);
  });

  it("should get all env vars", () => {
    const result = service.getAll();
    expect(result).toEqual({ KEY: "value", SECRET: "secret123" });
    expect(mockProvider.read).toHaveBeenCalled();
  });

  it("should search env vars", () => {
    mockProvider.search = jest.fn().mockReturnValue({ KEY: "value" });
    const result = service.search("KEY");
    expect(result).toEqual({ KEY: "value" });
    expect(mockProvider.search).toHaveBeenCalledWith("KEY", false);
  });

  it("should get specific env var", () => {
    mockProvider.get = jest.fn().mockReturnValue("value");
    const result = service.get("KEY");
    expect(result).toBe("value");
    expect(mockProvider.get).toHaveBeenCalledWith("KEY");
  });

  it("should set env var", () => {
    service.set("KEY", "newvalue");
    expect(mockProvider.set).toHaveBeenCalledWith("KEY", "newvalue");
  });
});

