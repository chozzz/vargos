import { describe, it, expect, beforeEach } from "vitest";
import { ServiceContainer } from "./container";

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  it("should register and resolve services", async () => {
    const service = { value: "test" };
    container.register<{ value: string }>("test", () => service);
    const resolved = await container.resolve<{ value: string }>("test");
    expect(resolved).toBe(service);
  });

  it("should return singleton instances", async () => {
    let count = 0;
    container.register<{ count: number }>("counter", () => ({ count: ++count }));
    const first = await container.resolve<{ count: number }>("counter");
    const second = await container.resolve<{ count: number }>("counter");
    expect(first).toBe(second);
    expect(first.count).toBe(1);
  });

  it("should throw if service not registered", async () => {
    await expect(container.resolve("missing")).rejects.toThrow();
  });

  it("should check if service exists", () => {
    container.register("test", () => ({}));
    expect(container.has("test")).toBe(true);
    expect(container.has("missing")).toBe(false);
  });
});

