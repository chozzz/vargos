import { ServiceContainer } from "./container";

describe("ServiceContainer", () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  it("should register and resolve services", async () => {
    const service = { value: "test" };
    container.register("test", () => service);
    const resolved = await container.resolve("test");
    expect(resolved).toBe(service);
  });

  it("should return singleton instances", async () => {
    let count = 0;
    container.register("counter", () => ({ count: ++count }));
    const first = await container.resolve("counter");
    const second = await container.resolve("counter");
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

