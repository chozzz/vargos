import { Provider } from "./provider.interface";

export interface VectorSearchOptions {
  collectionName: string;
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

export interface VectorSearchResult<T = Record<string, any>> {
  id: string;
  score: number;
  payload: T;
}

export interface VectorIndexData<T = Record<string, any>> {
  collectionName: string;
  id: string;
  vector: number[];
  payload: T;
}

export interface VectorDBProvider extends Provider {
  createCollection(name: string, vectorSize: number): Promise<void>;
  collectionExists(name: string): Promise<boolean>;
  search(
    vector: number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]>;
  index(data: VectorIndexData): Promise<void>;
  delete(collectionName: string, id: string): Promise<void>;
}
