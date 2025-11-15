import { LLMService } from "./llm.service";
import { LLMProvider, Message } from "./interfaces/llm.interface";

describe("LLMService", () => {
  let mockProvider: jest.Mocked<LLMProvider>;
  let service: LLMService;

  beforeEach(() => {
    mockProvider = {
      initialize: jest.fn().mockResolvedValue(undefined),
      generateEmbeddings: jest.fn(),
      chat: jest.fn(),
    };
    service = new LLMService(mockProvider);
  });

  it("should generate embeddings for single text", async () => {
    mockProvider.generateEmbeddings = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const result = await service.generateEmbeddings("test");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockProvider.generateEmbeddings).toHaveBeenCalledWith("test");
  });

  it("should generate embeddings for multiple texts", async () => {
    const embeddings = [[0.1, 0.2], [0.3, 0.4]];
    mockProvider.generateEmbeddings = jest.fn().mockResolvedValue(embeddings);
    const result = await service.generateEmbeddings(["test1", "test2"]);
    expect(result).toEqual(embeddings);
    expect(mockProvider.generateEmbeddings).toHaveBeenCalledWith(["test1", "test2"]);
  });

  it("should chat with messages", async () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    const response = { content: "hi", role: "assistant" };
    mockProvider.chat = jest.fn().mockResolvedValue(response);
    const result = await service.chat(messages);
    expect(result).toEqual(response);
    expect(mockProvider.chat).toHaveBeenCalledWith(messages);
  });
});

