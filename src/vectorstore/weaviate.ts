/**
 * Weaviate Vector Store Implementation
 */

import weaviate, { WeaviateClient } from 'weaviate-ts-client';
import { IVectorStore, Memory, MemorySearchResult, MemoryLayer, MemorySource } from '../types.js';
import { config } from '../config.js';

const CLASS_NAME = 'Memory';

// Type definitions for Weaviate responses
interface WeaviateObject {
  id: string;
  properties?: Record<string, unknown>;
  vector?: {
    default?: number[];
  };
}

interface WeaviateGraphQLResponse {
  data?: {
    Get?: {
      [key: string]: Array<{
        id: string;
        _additional?: {
          distance?: number;
        };
        [key: string]: unknown;
      }>;
    };
  };
}

export class WeaviateVectorStore implements IVectorStore {
  private client: WeaviateClient;
  private dimensions: number;
  private initialized: boolean = false;

  constructor(dimensions: number) {
    this.dimensions = dimensions;

    const headers: Record<string, string> = {};
    if (config.weaviate.apiKey) {
      headers['Authorization'] = `Bearer ${config.weaviate.apiKey}`;
    }

    // Weaviate v2.0.0: The default export is an object with a .client() method
    this.client = (weaviate as any).client({
      scheme: config.weaviate.url.startsWith('https') ? 'https' : 'http',
      host: config.weaviate.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      headers,
    });
  }

  /**
   * Initialize Weaviate connection and create schema if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if class exists by attempting to get it
      try {
        await this.client.schema
          .classGetter()
          .withClassName(CLASS_NAME)
          .do();
      } catch {
        // Class doesn't exist, create it
        await this.client.schema
          .classCreator()
          .withClass({
            class: CLASS_NAME,
            description: 'Stored memories for AI agent',
            vectorizer: 'none', // We provide our own vectors
            properties: [
              {
                name: 'content',
                dataType: ['text'],
                description: 'The memory content',
              },
              {
                name: 'timestamp',
                dataType: ['number'],
                description: 'Unix timestamp in milliseconds',
              },
              {
                name: 'importance',
                dataType: ['number'],
                description: 'Importance score 0-1',
              },
              {
                name: 'source',
                dataType: ['string'],
                description: 'Source of the memory',
              },
              {
                name: 'tags',
                dataType: ['string[]'],
                description: 'Tags associated with the memory',
              },
              {
                name: 'accessCount',
                dataType: ['number'],
                description: 'Number of times accessed',
              },
              {
                name: 'lastAccessed',
                dataType: ['number'],
                description: 'Last access timestamp',
              },
              {
                name: 'layer',
                dataType: ['string'],
                description: 'Memory layer (working, short-term, long-term)',
              },
            ],
          })
          .do();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize Weaviate: ${error}`);
    }
  }

  /**
   * Store a memory with its embedding
   */
  async store(memory: Memory): Promise<void> {
    if (!memory.embedding) {
      throw new Error('Memory must have an embedding to store');
    }

    await this.client.data
      .creator()
      .withClassName(CLASS_NAME)
      .withId(memory.id)
      .withProperties({
        content: memory.content,
        timestamp: memory.metadata.timestamp,
        importance: memory.metadata.importance,
        source: memory.metadata.source,
        tags: memory.metadata.tags,
        accessCount: memory.metadata.accessCount,
        lastAccessed: memory.metadata.lastAccessed,
        layer: memory.metadata.layer,
      })
      .withVector(memory.embedding)
      .do();
  }

  /**
   * Store multiple memories
   */
  async storeBatch(memories: Memory[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      const promises = batch.map(memory => this.store(memory));
      await Promise.all(promises);
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
    // Weaviate v2.0.0: withFields expects a comma-separated string, not an array
    const fields = [
      'id',
      'content',
      '_additional { distance }',
      'timestamp',
      'importance',
      'source',
      'tags',
      'accessCount',
      'lastAccessed',
      'layer',
    ].join(' ');

    let builder = this.client.graphql
      .get()
      .withClassName(CLASS_NAME)
      .withNearVector({ vector: embedding })
      .withLimit(limit)
      .withFields(fields);

    // Add where clause for filters (simplified - Weaviate where builder is complex)
    // For now, we'll filter after getting results

    const result = (await builder.do()) as WeaviateGraphQLResponse;
    const memories = result.data?.Get?.[CLASS_NAME] || [];

    let results = memories.map((item: any) => {
      const distance = item._additional?.distance || 0;
      const relevance = 1 - distance; // Convert distance to similarity

      return {
        id: item.id,
        content: item.content as string,
        relevance,
        metadata: {
          timestamp: item.timestamp as number,
          importance: item.importance as number,
          source: item.source as MemorySource,
          tags: item.tags as string[],
          accessCount: item.accessCount as number,
          lastAccessed: item.lastAccessed as number,
          layer: item.layer as MemoryLayer,
        },
      };
    });

    // Apply filters post-query
    if (filter) {
      results = results.filter(r => {
        if (filter.layer && r.metadata.layer !== filter.layer) {
          return false;
        }
        if (filter.tags && Array.isArray(filter.tags)) {
          const hasAllTags = filter.tags.every((tag: string) =>
            r.metadata.tags.includes(tag)
          );
          if (!hasAllTags) return false;
        }
        if (typeof filter.minImportance === 'number' && r.metadata.importance < filter.minImportance) {
          return false;
        }
        return true;
      });
    }

    return results.slice(0, limit);
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    try {
      const result = (await this.client.data
        .getterById()
        .withId(id)
        .withClassName(CLASS_NAME)
        .do()) as WeaviateObject;

      if (!result || !result.properties) return null;

      return {
        id: result.id,
        content: result.properties.content as string,
        embedding: result.vector?.default,
        metadata: {
          timestamp: result.properties.timestamp as number,
          importance: result.properties.importance as number,
          source: result.properties.source as MemorySource,
          tags: result.properties.tags as string[],
          accessCount: result.properties.accessCount as number,
          lastAccessed: result.properties.lastAccessed as number,
          layer: result.properties.layer as MemoryLayer,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.client.data.deleter().withId(id).withClassName(CLASS_NAME).do();
      return true;
    } catch {
      return false;
    }
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
    // Weaviate v2.0.0: withFields expects a comma-separated string, not an array
    const fields = [
      'id',
      'content',
      'timestamp',
      'importance',
      'source',
      'tags',
      'accessCount',
      'lastAccessed',
      'layer',
    ].join(' ');

    let builder = this.client.graphql
      .get()
      .withClassName(CLASS_NAME)
      .withFields(fields)
      .withLimit(1000); // Max limit

    const result = (await builder.do()) as WeaviateGraphQLResponse;
    const items = result.data?.Get?.[CLASS_NAME] || [];

    let memories = items.map((item: any) => ({
      id: item.id,
      content: item.content,
      metadata: {
        timestamp: item.timestamp,
        importance: item.importance,
        source: item.source as MemorySource,
        tags: item.tags,
        accessCount: item.accessCount,
        lastAccessed: item.lastAccessed,
        layer: item.layer as MemoryLayer,
      },
    }));

    // Apply filters
    if (filter) {
      memories = memories.filter(m => {
        if (filter.layer && m.metadata.layer !== filter.layer) {
          return false;
        }
        if (filter.tags && Array.isArray(filter.tags)) {
          const hasAllTags = filter.tags.every((tag: string) =>
            m.metadata.tags.includes(tag)
          );
          if (!hasAllTags) return false;
        }
        return true;
      });
    }

    return memories;
  }

  /**
   * Update a memory
   */
  async update(memory: Memory): Promise<void> {
    // Weaviate v2.0.0: Use updater() to update both properties and vector
    // Note: Weaviate doesn't support partial updates with vectors, so we need to delete and recreate
    // or use the updater with the full object

    // First, delete the existing object
    await this.client.data
      .deleter()
      .withId(memory.id)
      .withClassName(CLASS_NAME)
      .do();

    // Then recreate it with updated values
    const creator = this.client.data
      .creator()
      .withId(memory.id)
      .withClassName(CLASS_NAME)
      .withProperties({
        content: memory.content,
        timestamp: memory.metadata.timestamp,
        importance: memory.metadata.importance,
        source: memory.metadata.source,
        tags: memory.metadata.tags,
        accessCount: memory.metadata.accessCount,
        lastAccessed: memory.metadata.lastAccessed,
        layer: memory.metadata.layer,
      });

    // Only add vector if it exists
    if (memory.embedding) {
      creator.withVector(memory.embedding);
    }

    await creator.do();
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    // No explicit close needed for Weaviate client
  }
}
