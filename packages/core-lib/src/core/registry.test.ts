import { ProviderRegistry } from "./registry";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it("should register and retrieve providers", () => {
    const provider = { name: "test" };
    registry.register("llm", "openai", provider);
    expect(registry.get("llm", "openai")).toBe(provider);
  });

  it("should list all providers of a type", () => {
    registry.register("llm", "openai", {});
    registry.register("llm", "anthropic", {});
    expect(registry.list("llm")).toEqual(["openai", "anthropic"]);
  });

  it("should check if provider exists", () => {
    registry.register("llm", "openai", {});
    expect(registry.has("llm", "openai")).toBe(true);
    expect(registry.has("llm", "anthropic")).toBe(false);
  });
});

