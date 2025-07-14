import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { EnvService } from "./env.service";
import { EnvProvider } from "./interfaces/env.interface";

describe("EnvService", () => {
  let mockProvider: {
    initialize: Mock;
    read: Mock;
    write: Mock;
    search: Mock;
    get: Mock;
    set: Mock;
  };
  let service: EnvService;

  beforeEach(() => {
    mockProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockReturnValue({ KEY: "value", SECRET: "secret123" }),
      write: vi.fn(),
      search: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    };
    service = new EnvService(mockProvider as unknown as EnvProvider);
  });

  it("should get all env vars", () => {
    const result = service.getAll();
    expect(result).toEqual({ KEY: "value", SECRET: "secret123" });
    expect(mockProvider.read).toHaveBeenCalled();
  });

  it("should search env vars", () => {
    mockProvider.search = vi.fn().mockReturnValue({ KEY: "value" });
    const result = service.search("KEY");
    expect(result).toEqual({ KEY: "value" });
    expect(mockProvider.search).toHaveBeenCalledWith("KEY", false);
  });

  it("should get specific env var", () => {
    mockProvider.get = vi.fn().mockReturnValue("value");
    const result = service.get("KEY");
    expect(result).toBe("value");
    expect(mockProvider.get).toHaveBeenCalledWith("KEY");
  });

  it("should set env var", () => {
    service.set("KEY", "newvalue");
    expect(mockProvider.set).toHaveBeenCalledWith("KEY", "newvalue");
  });
});

