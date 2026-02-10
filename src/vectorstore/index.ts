/**
 * Vector Store implementations
 */

import { config } from '../config.js';
import { IVectorStore } from '../types.js';
import { MemoryVectorStore } from './memory.js';
import { WeaviateVectorStore } from './weaviate.js';
import { PineconeVectorStore } from './pinecone.js';

/**
 * Factory function to create vector store based on configuration
 */
export function createVectorStore(embeddingDimensions: number): IVectorStore {
  switch (config.vectorStoreType) {
    case 'weaviate':
      return new WeaviateVectorStore(embeddingDimensions);
    case 'pinecone':
      return new PineconeVectorStore(embeddingDimensions);
    case 'memory':
      return new MemoryVectorStore();
    default:
      throw new Error(`Unknown vector store type: ${config.vectorStoreType}`);
  }
}

export { MemoryVectorStore, WeaviateVectorStore, PineconeVectorStore };
export type { IVectorStore } from '../types.js';
