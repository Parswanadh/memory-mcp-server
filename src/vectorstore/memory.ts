/**
 * In-Memory Vector Store Implementation
 * For development and testing purposes
 */

import { IVectorStore, Memory, MemorySearchResult } from '../types.js';

interface StoredMemory {
  memory: Memory;
  embedding: number[];
}

export class MemoryVectorStore implements IVectorStore {
  private memories: Map<string, StoredMemory>;
  private initialized: boolean = false;

  constructor() {
    this.memories = new Map();
  }

  /**
   * Initialize the in-memory store
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Store a memory with its embedding
   */
  async store(memory: Memory): Promise<void> {
    if (!memory.embedding) {
      throw new Error('Memory must have an embedding to store');
    }

    this.memories.set(memory.id, {
      memory,
      embedding: memory.embedding,
    });
  }

  /**
   * Store multiple memories
   */
  async storeBatch(memories: Memory[]): Promise<void> {
    for (const memory of memories) {
      await this.store(memory);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Search for similar memories by embedding
   */
  async search(
    embedding: number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];

    for (const [id, stored] of this.memories) {
      // Apply filters if provided
      if (filter) {
        if (filter.layer && stored.memory.metadata.layer !== filter.layer) {
          continue;
        }
        if (filter.tags && Array.isArray(filter.tags)) {
          const hasAllTags = filter.tags.every((tag: string) =>
            stored.memory.metadata.tags.includes(tag)
          );
          if (!hasAllTags) continue;
        }
        if (typeof filter.minImportance === 'number' && stored.memory.metadata.importance < filter.minImportance) {
          continue;
        }
      }

      const relevance = this.cosineSimilarity(embedding, stored.embedding);

      results.push({
        id: stored.memory.id,
        content: stored.memory.content,
        relevance,
        metadata: stored.memory.metadata,
      });
    }

    // Sort by relevance (descending) and limit
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    const stored = this.memories.get(id);
    return stored?.memory || null;
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    return this.memories.delete(id);
  }

  /**
   * Delete multiple memories by IDs
   */
  async deleteBatch(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * List all memories with optional filtering
   */
  async list(filter?: Record<string, unknown>): Promise<Memory[]> {
    const results: Memory[] = [];

    for (const stored of this.memories.values()) {
      if (filter) {
        if (filter.layer && stored.memory.metadata.layer !== filter.layer) {
          continue;
        }
        if (filter.tags && Array.isArray(filter.tags)) {
          const hasAllTags = filter.tags.every((tag: string) =>
            stored.memory.metadata.tags.includes(tag)
          );
          if (!hasAllTags) continue;
        }
      }
      results.push(stored.memory);
    }

    return results;
  }

  /**
   * Update a memory
   */
  async update(memory: Memory): Promise<void> {
    const existing = this.memories.get(memory.id);
    if (!existing) {
      throw new Error(`Memory with id ${memory.id} not found`);
    }

    this.memories.set(memory.id, {
      memory,
      embedding: memory.embedding || existing.embedding,
    });
  }

  /**
   * Close the connection (no-op for in-memory)
   */
  async close(): Promise<void> {
    this.memories.clear();
  }
}
