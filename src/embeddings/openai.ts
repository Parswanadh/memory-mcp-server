/**
 * OpenAI Embedding Provider Implementation
 */

import { IEmbeddingProvider } from '../types.js';
import { config } from '../config.js';

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private dimensions: number;
  private model: string;

  constructor() {
    this.model = config.embedding.openaiModel;
    this.dimensions = config.embedding.openaiDimensions;

    if (!config.embedding.openaiApiKey) {
      throw new Error('OpenAI API key is required for OpenAI embedding provider');
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.embedding.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Process in batches of 100 (OpenAI limit)
    const batchSize = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.embedding.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
          dimensions: this.dimensions,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
      const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding);
      results.push(...embeddings);
    }

    return results;
  }

  /**
   * Get the dimension of the embedding vectors
   */
  getDimensions(): number {
    return this.dimensions;
  }
}
