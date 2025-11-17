import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { LLMService } from "./llm.service";
import { LLMProvider, Message } from "./interfaces/llm.interface";

describe("LLMService", () => {
  let mockProvider: {
    initialize: Mock;
    generateEmbeddings: Mock;
    chat: Mock;
  };
  let service: LLMService;

  beforeEach(() => {
    mockProvider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      generateEmbeddings: vi.fn(),
      chat: vi.fn(),
    };
    service = new LLMService(mockProvider as unknown as LLMProvider);
  });

  it("should generate embeddings for single text", async () => {
    mockProvider.generateEmbeddings = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const result = await service.generateEmbeddings("test");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockProvider.generateEmbeddings).toHaveBeenCalledWith("test");
  });

  it("should generate embeddings for multiple texts", async () => {
    const embeddings = [[0.1, 0.2], [0.3, 0.4]];
    mockProvider.generateEmbeddings = vi.fn().mockResolvedValue(embeddings);
    const result = await service.generateEmbeddings(["test1", "test2"]);
    expect(result).toEqual(embeddings);
    expect(mockProvider.generateEmbeddings).toHaveBeenCalledWith(["test1", "test2"]);
  });

  it("should chat with messages", async () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const response = { content: "hi", role: "assistant" };
    mockProvider.chat = vi.fn().mockResolvedValue(response);
    const result = await service.chat(messages);
    expect(result).toEqual(response);
    expect(mockProvider.chat).toHaveBeenCalledWith(messages);
  });
});

