import { Provider } from "./provider.interface";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  role: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}

export interface LLMClient {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  chat(messages: Message[]): Promise<ChatResponse>;
}

export interface LLMProvider extends Provider {
  generateEmbeddings(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  chat(messages: Message[]): Promise<ChatResponse>;
}
