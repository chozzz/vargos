import { describe, it, expect } from 'vitest';
import { simpleEmbedding, cosineSimilarity, textScore } from './embedding.js';

describe('simpleEmbedding', () => {
  it('returns a 384-dimensional vector', () => {
    const vec = simpleEmbedding('hello world');
    expect(vec).toHaveLength(384);
  });

  it('returns normalized vector (unit length)', () => {
    const vec = simpleEmbedding('hello world');
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 4);
  });

  it('produces similar vectors for similar text', () => {
    const a = simpleEmbedding('the quick brown fox');
    const b = simpleEmbedding('the quick brown dog');
    const c = simpleEmbedding('completely unrelated quantum physics');
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });

  it('handles empty string without error', () => {
    const vec = simpleEmbedding('');
    expect(vec).toHaveLength(384);
    // All zeros, magnitude 0 → stays zeros
    expect(vec.every(v => v === 0)).toBe(true);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = [1, 0, 0];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 4);
  });

  it('returns ~0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 4);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 4);
  });
});

describe('textScore', () => {
  it('returns 1 when all terms match', () => {
    expect(textScore('hello world', 'hello world example')).toBe(1);
  });

  it('returns 0 when no terms match', () => {
    expect(textScore('alpha beta', 'gamma delta epsilon')).toBe(0);
  });

  it('returns partial score for partial matches', () => {
    const score = textScore('hello world foo', 'hello world example');
    expect(score).toBeCloseTo(2 / 3, 4);
  });

  it('is case insensitive', () => {
    expect(textScore('Hello World', 'HELLO WORLD')).toBe(1);
  });

  it('returns 0 for query with only short terms', () => {
    // Terms <= 2 chars are filtered out
    expect(textScore('a b c', 'a b c')).toBe(0);
  });
});
