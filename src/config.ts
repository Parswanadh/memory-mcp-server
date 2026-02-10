/**
 * Configuration management for the Memory MCP Server
 */

import dotenv from 'dotenv';
import { MemoryLayer } from './types.js';

dotenv.config();

/**
 * Application configuration
 */
export const config = {
  // Vector Store Configuration
  vectorStoreType: process.env.VECTOR_STORE_TYPE as 'weaviate' | 'pinecone' | 'memory' || 'memory',

  // Weaviate Configuration
  weaviate: {
    url: process.env.WEAVIATE_URL || 'http://localhost:8080',
    apiKey: process.env.WEAVIATE_API_KEY,
  },

  // Pinecone Configuration
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || '',
    index: process.env.PINECONE_INDEX || 'memory-mcp',
    environment: process.env.PINECONE_ENVIRONMENT || '',
  },

  // Embedding Configuration
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER as 'openai' | 'local' || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    openaiDimensions: parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10),
  },

  // Memory Layer TTL Configuration (milliseconds)
  ttl: {
    [MemoryLayer.WORKING]: parseInt(process.env.WORKING_MEMORY_TTL || '1800000', 10),      // 30 minutes
    [MemoryLayer.SHORT_TERM]: parseInt(process.env.SHORT_TERM_MEMORY_TTL || '604800000', 10), // 7 days
    [MemoryLayer.LONG_TERM]: parseInt(process.env.LONG_TERM_MEMORY_TTL || '31536000000', 10),  // 1 year
  },

  // Consolidation Configuration
  consolidation: {
    threshold: parseInt(process.env.CONSOLIDATION_THRESHOLD || '100', 10),
    age: parseInt(process.env.CONSOLIDATION_AGE || '2592000000', 10), // 30 days
  },

  // Importance Decay Configuration
  decay: {
    rate: parseFloat(process.env.DECAY_RATE || '0.1'),
    interval: parseInt(process.env.DECAY_INTERVAL || '86400000', 10), // Daily
  },

  // MCP Server Configuration
  server: {
    name: process.env.MCP_SERVER_NAME || 'persistent-memory',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
  },

  // Validation
  validate(): void {
    const required: Record<string, string> = {};

    if (this.vectorStoreType === 'weaviate' && !this.weaviate.url) {
      required.weaviateUrl = 'WEAVIATE_URL';
    }

    if (this.vectorStoreType === 'pinecone' && !this.pinecone.apiKey) {
      required.pineconeApiKey = 'PINECONE_API_KEY';
    }

    if (this.embedding.provider === 'openai' && !this.embedding.openaiApiKey) {
      required.openaiApiKey = 'OPENAI_API_KEY';
    }

    const missing = Object.entries(required).map(([key, env]) => `${env} (required for ${key})`);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables:\n  - ${missing.join('\n  - ')}`);
    }
  }
};

/**
 * Validate configuration on import
 */
try {
  config.validate();
} catch (error) {
  if (config.vectorStoreType !== 'memory') {
    console.warn('Configuration validation warning:', error);
  }
}
