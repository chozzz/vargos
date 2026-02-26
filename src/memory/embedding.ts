export interface EmbeddingConfig {
  provider: 'openai' | 'local' | 'none';
  openaiApiKey?: string;
}

export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig,
): Promise<number[] | undefined> {
  if (config.provider === 'openai' && config.openaiApiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text.slice(0, 8000),
          model: 'text-embedding-3-small',
        }),
      });

      if (!response.ok) return undefined;

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0].embedding;
    } catch {
      return undefined;
    }
  }

  return simpleEmbedding(text);
}

export function simpleEmbedding(text: string): number[] {
  const dim = 384;
  const vec = new Float32Array(dim);

  // Character n-gram hashing
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) - hash) + trigram.charCodeAt(j);
      hash = hash & hash;
    }
    vec[Math.abs(hash) % dim] += 1;
  }

  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] /= magnitude;
    }
  }

  return Array.from(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

export function textScore(query: string, content: string): number {
  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const contentLower = content.toLowerCase();

  if (queryTerms.length === 0) return 0;

  let matches = 0;
  for (const term of queryTerms) {
    if (contentLower.includes(term)) matches++;
  }

  // IDF would be better, but this works for small corpora
  return matches / queryTerms.length;
}
