/**
 * Memory Manager - Handles memory layer management and lifecycle
 */

// Secure UUID v4 implementation using Node.js crypto
import { randomUUID } from 'node:crypto';

function generateId(): string {
  return randomUUID();
}

import {
  IVectorStore,
  IEmbeddingProvider,
  Memory,
  MemoryLayer,
  MemorySource,
  MemoryStoreOptions,
  MemorySearchOptions,
  MemorySearchResult,
  ConsolidationResult,
  ForgetResult,
} from '../types.js';
import { config } from '../config.js';

export class MemoryManager {
  private vectorStore: IVectorStore;
  private embeddingProvider: IEmbeddingProvider;
  private workingMemory: Map<string, Memory>;

  constructor(vectorStore: IVectorStore, embeddingProvider: IEmbeddingProvider) {
    this.vectorStore = vectorStore;
    this.embeddingProvider = embeddingProvider;
    this.workingMemory = new Map();
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
    await this.loadWorkingMemory();
  }

  /**
   * Load frequently accessed memories into working memory
   */
  private async loadWorkingMemory(): Promise<void> {
    // Load recently accessed memories
    const recentMemories = await this.vectorStore.list({
      // In a real implementation, you'd filter by lastAccessed
    });

    // Sort by access count and last accessed time
    const sorted = recentMemories
      .sort((a, b) => {
        const scoreA = a.metadata.accessCount / (Date.now() - a.metadata.lastAccessed);
        const scoreB = b.metadata.accessCount / (Date.now() - b.metadata.lastAccessed);
        return scoreB - scoreA;
      })
      .slice(0, 100); // Keep top 100 in working memory

    for (const memory of sorted) {
      this.workingMemory.set(memory.id, memory);
    }
  }

  /**
   * Store a new memory
   */
  async store(
    content: string,
    options: MemoryStoreOptions = {}
  ): Promise<Memory> {
    const id = generateId();
    const now = Date.now();

    // Generate embedding
    const embedding = await this.embeddingProvider.embed(content);

    const memory: Memory = {
      id,
      content,
      embedding,
      metadata: {
        timestamp: now,
        importance: options.importance ?? 0.5,
        source: options.source ?? MemorySource.AGENT,
        tags: options.tags ?? [],
        accessCount: 0,
        lastAccessed: now,
        layer: options.layer ?? this.determineInitialLayer(options),
      },
    };

    // Store in working memory
    this.workingMemory.set(id, memory);

    // Store in vector store
    await this.vectorStore.store(memory);

    return memory;
  }

  /**
   * Determine the initial layer for a memory
   */
  private determineInitialLayer(options: MemoryStoreOptions): MemoryLayer {
    const importance = options.importance ?? 0.5;

    if (importance >= 0.8) {
      return MemoryLayer.LONG_TERM;
    } else if (importance >= 0.5) {
      return MemoryLayer.SHORT_TERM;
    }
    return MemoryLayer.WORKING;
  }

  /**
   * Search memories by semantic similarity
   */
  async search(
    query: string,
    options: MemorySearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    const limit = options.limit ?? 10;
    const minRelevance = options.minRelevance ?? 0;

    // Generate query embedding
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // Build filter
    const filter: Record<string, unknown> = {};
    if (options.layerFilter && options.layerFilter.length > 0) {
      filter.layer = options.layerFilter[0]; // Simplified - extend for multiple layers
    }
    if (options.tags && options.tags.length > 0) {
      filter.tags = options.tags;
    }

    // Search vector store
    let results = await this.vectorStore.search(queryEmbedding, limit * 2, filter);

    // Filter by min relevance
    results = results.filter(r => r.relevance >= minRelevance);

    // Update access counts
    for (const result of results) {
      await this.updateAccessCount(result.id);
    }

    return results.slice(0, limit);
  }

  /**
   * Update access count and last accessed time
   */
  private async updateAccessCount(id: string): Promise<void> {
    const memory = await this.get(id);
    if (memory) {
      memory.metadata.accessCount++;
      memory.metadata.lastAccessed = Date.now();

      // Update in working memory if present
      if (this.workingMemory.has(id)) {
        this.workingMemory.set(id, memory);
      }

      // Update in vector store
      await this.vectorStore.update(memory);
    }
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    // Check working memory first
    const working = this.workingMemory.get(id);
    if (working) {
      return working;
    }

    // Check vector store
    return await this.vectorStore.get(id);
  }

  /**
   * Recall context-relevant memories for a task
   */
  async recall(task: string, context?: string, limit: number = 10): Promise<{
    relevantMemories: MemorySearchResult[];
    summary: string;
  }> {
    // Build search query from task and context
    const searchQuery = context ? `${task}\n\nContext: ${context}` : task;

    // Search across all layers
    const relevantMemories = await this.search(searchQuery, {
      limit,
      layerFilter: [MemoryLayer.WORKING, MemoryLayer.SHORT_TERM, MemoryLayer.LONG_TERM],
    });

    // Generate summary
    const summary = this.generateSummary(relevantMemories, task);

    return { relevantMemories, summary };
  }

  /**
   * Generate a summary of search results
   */
  private generateSummary(results: MemorySearchResult[], task: string): string {
    if (results.length === 0) {
      return `No relevant memories found for task: "${task}"`;
    }

    const layers = results.reduce((acc, r) => {
      acc[r.metadata.layer] = (acc[r.metadata.layer] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const layerSummary = Object.entries(layers)
      .map(([layer, count]) => `${count} ${layer}`)
      .join(', ');

    return `Found ${results.length} relevant memories (${layerSummary}) for task: "${task}"`;
  }

  /**
   * Consolidate old memories
   */
  async consolidate(options: {
    olderThan?: number;
    targetSize?: number;
    layer?: MemoryLayer;
  } = {}): Promise<ConsolidationResult> {
    const now = Date.now();
    const olderThan = options.olderThan ?? (now - config.consolidation.age);
    const targetSize = options.targetSize ?? 50;
    const layer = options.layer ?? MemoryLayer.SHORT_TERM;

    // Get old memories
    const allMemories = await this.vectorStore.list({ layer });
    const oldMemories = allMemories.filter(m => m.metadata.timestamp < olderThan);

    if (oldMemories.length < targetSize) {
      return {
        consolidated: [],
        deleted: [],
        summary: `Not enough old memories to consolidate. Found ${oldMemories.length}, need at least ${targetSize}`,
      };
    }

    // Sort by importance and access pattern
    const sortedMemories = oldMemories.sort((a, b) => {
      const scoreA = this.calculateMemoryScore(a);
      const scoreB = this.calculateMemoryScore(b);
      return scoreB - scoreA;
    });

    // Keep top memories, consolidate the rest
    const toKeep = sortedMemories.slice(0, targetSize);
    const toConsolidate = sortedMemories.slice(targetSize);

    // Group by tags for consolidation
    const grouped = this.groupByTags(toConsolidate);
    const consolidated: Memory[] = [];
    const deleted: string[] = [];

    for (const [tag, memories] of Object.entries(grouped)) {
      if (memories.length < 3) {
        // Not enough to consolidate, keep as is
        toKeep.push(...memories);
        continue;
      }

      // Create consolidated memory
      const consolidatedContent = this.consolidateMemories(memories);
      const avgImportance =
        memories.reduce((sum, m) => sum + m.metadata.importance, 0) / memories.length;

      const consolidatedMemory = await this.store(consolidatedContent, {
        importance: avgImportance * 0.9, // Slightly reduce importance
        tags: [...new Set(memories.flatMap(m => m.metadata.tags)), tag, 'consolidated'],
        source: MemorySource.SYSTEM,
        layer: MemoryLayer.LONG_TERM,
      });

      consolidated.push(consolidatedMemory);

      // Delete old memories
      const ids = memories.map(m => m.id);
      await this.vectorStore.deleteBatch(ids);
      for (const id of ids) {
        this.workingMemory.delete(id);
        deleted.push(id);
      }
    }

    return {
      consolidated,
      deleted,
      summary: `Consolidated ${consolidated.length} memories from ${deleted.length} old memories`,
    };
  }

  /**
   * Calculate memory score for consolidation decisions
   */
  private calculateMemoryScore(memory: Memory): number {
    const age = Date.now() - memory.metadata.timestamp;
    const ageDays = age / (1000 * 60 * 60 * 24);

    // Importance with decay
    const decayedImportance =
      memory.metadata.importance * Math.exp(-config.decay.rate * (ageDays / 30));

    // Access frequency bonus
    const accessBonus = Math.log(memory.metadata.accessCount + 1) * 0.1;

    return decayedImportance + accessBonus;
  }

  /**
   * Group memories by tags
   */
  private groupByTags(memories: Memory[]): Record<string, Memory[]> {
    const groups: Record<string, Memory[]> = {};

    for (const memory of memories) {
      const primaryTag = memory.metadata.tags[0] || 'uncategorized';
      if (!groups[primaryTag]) {
        groups[primaryTag] = [];
      }
      groups[primaryTag].push(memory);
    }

    return groups;
  }

  /**
   * Consolidate multiple memories into one
   */
  private consolidateMemories(memories: Memory[]): string {
    // Extract key information from memories
    const contents = memories.map(m => m.content);

    // Count tag occurrences
    const tagCounts = memories.flatMap(m => m.metadata.tags).reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    // Create consolidated content
    const dateRange = {
      start: new Date(Math.min(...memories.map(m => m.metadata.timestamp))),
      end: new Date(Math.max(...memories.map(m => m.metadata.timestamp))),
    };

    return `[Consolidated Memory: ${memories.length} entries from ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}]\n` +
      `Tags: ${topTags.join(', ')}\n` +
      `Summary: ${contents.slice(0, 3).join(' | ')}${contents.length > 3 ? '...' : ''}`;
  }

  /**
   * Forget memories (explicit deletion or time-based)
   */
  async forget(options: {
    memoryId?: string;
    olderThan?: number;
    layer?: MemoryLayer;
    reason?: string;
  }): Promise<ForgetResult> {
    const deleted: string[] = [];
    const reasons: string[] = [];

    if (options.memoryId) {
      // Delete specific memory
      const success = await this.vectorStore.delete(options.memoryId);
      this.workingMemory.delete(options.memoryId);

      if (success) {
        deleted.push(options.memoryId);
        reasons.push(options.reason || 'Explicit deletion');
      }
    }

    if (options.olderThan || options.layer) {
      // Delete by criteria
      const memories = await this.vectorStore.list({
        layer: options.layer as string,
      });

      const toDelete = memories.filter(m => {
        if (options.olderThan && m.metadata.timestamp >= options.olderThan) {
          return false;
        }
        return true;
      });

      const ids = toDelete.map(m => m.id);
      await this.vectorStore.deleteBatch(ids);

      for (const id of ids) {
        this.workingMemory.delete(id);
        deleted.push(id);
      }

      reasons.push(
        options.olderThan
          ? `Older than ${new Date(options.olderThan).toLocaleDateString()}`
          : `Layer: ${options.layer}`
      );
    }

    return {
      deleted,
      reason: reasons.join('; ') || 'No memories matched criteria',
    };
  }

  /**
   * Apply importance decay to old memories
   */
  async applyImportanceDecay(): Promise<void> {
    const allMemories = await this.vectorStore.list();
    const now = Date.now();

    for (const memory of allMemories) {
      const age = now - memory.metadata.timestamp;
      const ageDays = age / (1000 * 60 * 60 * 24);

      if (ageDays >= 1) {
        // Apply decay
        const decayFactor = Math.exp(-config.decay.rate * (ageDays / 30));
        memory.metadata.importance = Math.max(0.1, memory.metadata.importance * decayFactor);

        // Update memory
        await this.vectorStore.update(memory);

        // Also update working memory if present
        if (this.workingMemory.has(memory.id)) {
          this.workingMemory.set(memory.id, memory);
        }
      }
    }
  }

  /**
   * Promote/demote memories between layers based on importance and access
   */
  async rebalanceLayers(): Promise<void> {
    const allMemories = await this.vectorStore.list();
    const now = Date.now();

    for (const memory of allMemories) {
      const score = this.calculateMemoryScore(memory);
      const age = now - memory.metadata.timestamp;
      const ttl = config.ttl[memory.metadata.layer];

      let newLayer: MemoryLayer | null = null;

      // Check if memory should be demoted (expired)
      if (age > ttl && score < 0.3) {
        if (memory.metadata.layer === MemoryLayer.LONG_TERM) {
          // Mark for potential deletion
          memory.metadata.importance = Math.max(0.1, memory.metadata.importance * 0.5);
        } else {
          newLayer = this.getNextLowerLayer(memory.metadata.layer);
        }
      }
      // Check if memory should be promoted
      else if (score > 0.8) {
        if (memory.metadata.layer !== MemoryLayer.LONG_TERM) {
          newLayer = MemoryLayer.LONG_TERM;
        }
      }

      if (newLayer && newLayer !== memory.metadata.layer) {
        memory.metadata.layer = newLayer;
        await this.vectorStore.update(memory);

        if (this.workingMemory.has(memory.id)) {
          this.workingMemory.set(memory.id, memory);
        }
      }
    }
  }

  /**
   * Get the next lower memory layer
   */
  private getNextLowerLayer(current: MemoryLayer): MemoryLayer {
    switch (current) {
      case MemoryLayer.LONG_TERM:
        return MemoryLayer.SHORT_TERM;
      case MemoryLayer.SHORT_TERM:
        return MemoryLayer.WORKING;
      default:
        return current;
    }
  }

  /**
   * Close the memory manager
   */
  async close(): Promise<void> {
    await this.vectorStore.close();
    this.workingMemory.clear();
  }
}
