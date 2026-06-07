export interface EmbeddingConfig {
    provider: 'openai' | 'local' | 'none';
    openaiApiKey?: string;
    model?: string;
}
export declare function generateEmbedding(text: string, config: EmbeddingConfig): Promise<number[] | undefined>;
export declare function cosineSimilarity(a: number[], b: number[]): number;
export declare function textScore(query: string, content: string): number;
//# sourceMappingURL=embedding.d.ts.map