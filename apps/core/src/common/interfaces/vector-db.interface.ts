import { Provider } from "./provider.interface";

export interface SearchOptions {
  collectionName: string;
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export interface IndexData {
  collectionName: string;
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface VectorDBProvider extends Provider {
  createCollection(name: string, vectorSize: number): Promise<void>;
  collectionExists(name: string): Promise<boolean>;
  search(vector: number[], options: SearchOptions): Promise<SearchResult[]>;
  index(data: IndexData): Promise<void>;
  delete(collectionName: string, id: string): Promise<void>;
}

export interface VectorClient {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
  index(data: IndexData): Promise<void>;
  delete(collectionName: string, id: string): Promise<void>;
  createCollection(name: string, vectorSize: number): Promise<void>;
  collectionExists(name: string): Promise<boolean>;
}
