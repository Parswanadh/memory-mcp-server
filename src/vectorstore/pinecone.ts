/**
 * Pinecone Vector Store Implementation
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { IVectorStore, Memory, MemorySearchResult, MemoryLayer, MemorySource } from '../types.js';
import { config } from '../config.js';

const NAMESPACE = 'memory-mcp';

export class PineconeVectorStore implements IVectorStore {
  private client: Pinecone;
  private indexName: string;
  private dimensions: number;
  private initialized: boolean = false;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
    this.indexName = config.pinecone.index;

    if (!config.pinecone.apiKey) {
      throw new Error('Pinecone API key is required');
    }

    this.client = new Pinecone({
      apiKey: config.pinecone.apiKey,
    });
  }

  /**
   * Initialize Pinecone connection
   */
  async initialize(): Promise<void> {
    try {
      // Verify index exists
      await this.client.describeIndex(this.indexName);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Pinecone: ${error}`);
    }
  }

  /**
   * Get the index
   */
  private getIndex() {
    return this.client.index(this.indexName);
  }

  /**
   * Convert Memory to Pinecone vector format
   */
  private memoryToVector(memory: Memory): Record<string, unknown> {
    return {
      id: memory.id,
      values: memory.embedding || [],
      metadata: {
        content: memory.content,
        timestamp: memory.metadata.timestamp,
        importance: memory.metadata.importance,
        source: memory.metadata.source,
        tags: memory.metadata.tags.join(','),
        accessCount: memory.metadata.accessCount,
        lastAccessed: memory.metadata.lastAccessed,
        layer: memory.metadata.layer,
      },
    };
  }

  /**
   * Convert Pinecone vector to Memory
   */
  private vectorToMemory(vector: {
    id: string;
    values?: number[];
    metadata?: Record<string, unknown>;
  }): Memory {
    const metadata = vector.metadata || {};
    return {
      id: vector.id,
      content: (metadata.content as string) || '',
      embedding: vector.values,
      metadata: {
        timestamp: (metadata.timestamp as number) || Date.now(),
        importance: (metadata.importance as number) || 0.5,
        source: (metadata.source as MemorySource) || MemorySource.AGENT,
        tags: (metadata.tags as string)?.split(',').filter(Boolean) || [],
        accessCount: (metadata.accessCount as number) || 0,
        lastAccessed: (metadata.lastAccessed as number) || Date.now(),
        layer: (metadata.layer as MemoryLayer) || MemoryLayer.SHORT_TERM,
      },
    };
  }

  /**
   * Build filter object from filter parameters
   */
  private buildFilter(filter?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!filter) return undefined;

    const conditions: Record<string, unknown>[] = [];

    if (filter.layer) {
      conditions.push({ layer: { $eq: filter.layer } });
    }

    if (filter.tags && Array.isArray(filter.tags)) {
      for (const tag of filter.tags) {
        conditions.push({ tags: { $contains: tag } });
      }
    }

    if (typeof filter.minImportance === 'number') {
      conditions.push({ importance: { $gte: filter.minImportance } });
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];

    return { $and: conditions };
  }

  /**
   * Store a memory with its embedding
   */
  async store(memory: Memory): Promise<void> {
    if (!memory.embedding) {
      throw new Error('Memory must have an embedding to store');
    }

    const index = this.getIndex();
    // Pinecone v5+ API: namespace is passed in options object
    await index.namespace(NAMESPACE).upsert([this.memoryToVector(memory) as never]);
  }

  /**
   * Store multiple memories
   */
  async storeBatch(memories: Memory[]): Promise<void> {
    const batchSize = 100;
    const index = this.getIndex();

    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      const vectors = batch.map(m => this.memoryToVector(m));
      // Pinecone v5+ API: namespace is passed via namespace() method
      await index.namespace(NAMESPACE).upsert(vectors as never[]);
    }
  }

  /**
   * Search for similar memories by embedding
   */
  async search(
    embedding: number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<MemorySearchResult[]> {
    const index = this.getIndex();

    const queryOptions: {
      vector: number[];
      topK: number;
      includeMetadata: boolean;
      includeValues: boolean;
      filter?: Record<string, unknown>;
    } = {
      vector: embedding,
      topK: limit,
      includeMetadata: true,
      includeValues: true,
    };

    const pineconeFilter = this.buildFilter(filter);
    if (pineconeFilter) {
      queryOptions.filter = pineconeFilter;
    }

    // Pinecone v5+ API: namespace is passed via namespace() method
    const result = await index.namespace(NAMESPACE).query(queryOptions);

    return (result.matches || []).map(match => {
      const memory = this.vectorToMemory({
        id: match.id,
        values: match.values,
        metadata: match.metadata,
      });

      return {
        id: memory.id,
        content: memory.content,
        relevance: match.score || 0,
        metadata: memory.metadata,
      };
    });
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    try {
      const index = this.getIndex();
      // Pinecone v5+ API: namespace is passed via namespace() method
      const result = await index.namespace(NAMESPACE).fetch([id]);
      const vector = result.records?.[id];

      if (!vector) return null;

      return this.vectorToMemory({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata,
      });
    } catch {
      return null;
    }
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const index = this.getIndex();
      await index.deleteOne(id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete multiple memories by IDs
   */
  async deleteBatch(ids: string[]): Promise<number> {
    try {
      const index = this.getIndex();
      await index.deleteMany(ids);
      return ids.length;
    } catch {
      return 0;
    }
  }

  /**
   * List all memories with optional filtering
   */
  async list(filter?: Record<string, unknown>): Promise<Memory[]> {
    // Note: Pinecone doesn't support list operations without query
    // We need to use a workaround with a dummy query
    try {
      const dummyVector = new Array(this.dimensions).fill(0);
      const result = await this.search(dummyVector, 1000, filter);

      return result.map(r => ({
        id: r.id,
        content: r.content,
        metadata: r.metadata,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Update a memory
   */
  async update(memory: Memory): Promise<void> {
    await this.store(memory);
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    // No explicit close needed for Pinecone client
  }
}
