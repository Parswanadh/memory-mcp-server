/**
 * Embedding provider implementations
 */

import { config } from '../config.js';
import { IEmbeddingProvider } from '../types.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { LocalEmbeddingProvider } from './local.js';

/**
 * Factory function to create embedding provider based on configuration
 */
export function createEmbeddingProvider(): IEmbeddingProvider {
  switch (config.embedding.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'local':
      return new LocalEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding provider: ${config.embedding.provider}`);
  }
}

export { OpenAIEmbeddingProvider, LocalEmbeddingProvider };
export type { IEmbeddingProvider } from '../types.js';
