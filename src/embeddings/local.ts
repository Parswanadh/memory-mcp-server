/**
 * Local Embedding Provider Implementation
 * Uses a simple TF-IDF based approach for local embeddings
 * This is a fallback for development/testing without external dependencies
 */

import { IEmbeddingProvider } from '../types.js';

interface Vocabulary {
  words: Map<string, number>;
  idf: Map<string, number>;
  documentCount: number;
}

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private vocabulary: Vocabulary;
  private dimensions: number;
  private maxDimensions: number = 512;

  constructor() {
    this.vocabulary = {
      words: new Map(),
      idf: new Map(),
      documentCount: 0,
    };
    this.dimensions = this.maxDimensions;
  }

  /**
   * Simple tokenization and preprocessing
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  /**
   * Build vocabulary from text (for IDF calculation)
   */
  private async updateVocabulary(texts: string[]): Promise<void> {
    for (const text of texts) {
      const tokens = new Set(this.tokenize(text));
      for (const token of tokens) {
        const count = this.vocabulary.words.get(token) || 0;
        this.vocabulary.words.set(token, count + 1);
      }
    }
    this.vocabulary.documentCount += texts.length;

    // Calculate IDF
    for (const [word, docFreq] of this.vocabulary.words) {
      const idf = Math.log((this.vocabulary.documentCount + 1) / (docFreq + 1)) + 1;
      this.vocabulary.idf.set(word, idf);
    }
  }

  /**
   * Generate embedding for a single text using TF-IDF
   */
  async embed(text: string): Promise<number[]> {
    await this.updateVocabulary([text]);

    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();

    // Calculate term frequency
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Create TF-IDF vector
    const vector = new Array(this.dimensions).fill(0);

    for (const [token, frequency] of tf) {
      const idf = this.vocabulary.idf.get(token) || 1;
      const tfidf = (frequency / tokens.length) * idf;

      // Simple hash-based dimension assignment
      const hash = this.hashString(token);
      const dim = Math.abs(hash) % this.dimensions;
      vector[dim] = tfidf;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }

    return vector;
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      results.push(await this.embed(text));
    }

    return results;
  }

  /**
   * Simple string hash for dimension assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Get the dimension of the embedding vectors
   */
  getDimensions(): number {
    return this.dimensions;
  }
}
