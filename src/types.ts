/**
 * Core type definitions for the Persistent Hierarchical Memory MCP Server
 */

/**
 * Memory layer types representing different retention periods
 */
export enum MemoryLayer {
  WORKING = 'working',       // minutes - current context
  SHORT_TERM = 'short-term', // days/weeks - recent interactions
  LONG_TERM = 'long-term'    // months - consolidated knowledge
}

/**
 * Source of the memory entry
 */
export enum MemorySource {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system'
}

/**
 * Metadata associated with each memory entry
 */
export interface MemoryMetadata {
  timestamp: number;           // Unix timestamp in milliseconds
  importance: number;          // 0-1 score
  source: MemorySource;
  tags: string[];
  accessCount: number;
  lastAccessed: number;
  layer: MemoryLayer;
  embeddingModel?: string;
}

/**
 * Core memory structure
 */
export interface Memory {
  id: string;
  content: string;
  embedding?: number[];
  metadata: MemoryMetadata;
}

/**
 * Result from memory search operations
 */
export interface MemorySearchResult {
  id: string;
  content: string;
  relevance: number;
  metadata: MemoryMetadata;
}

/**
 * Consolidation result
 */
export interface ConsolidationResult {
  consolidated: Memory[];
  deleted: string[];
  summary: string;
}

/**
 * Forgetting result
 */
export interface ForgetResult {
  deleted: string[];
  reason: string;
}

/**
 * Configuration for memory storage
 */
export interface MemoryStoreOptions {
  importance?: number;         // Default: 0.5
  tags?: string[];
  source?: MemorySource;
  layer?: MemoryLayer;
}

/**
 * Configuration for memory search
 */
export interface MemorySearchOptions {
  limit?: number;              // Default: 10
  layerFilter?: MemoryLayer[]; // Search specific layers only
  minRelevance?: number;       // Minimum similarity threshold (0-1)
  tags?: string[];             // Filter by tags
}

/**
 * Configuration for memory recall
 */
export interface MemoryRecallOptions {
  task?: string;
  context?: string;
  limit?: number;
}

/**
 * Configuration for memory consolidation
 */
export interface ConsolidationOptions {
  olderThan?: number;          // Timestamp in milliseconds
  targetSize?: number;         // Target number of consolidated memories
  layer?: MemoryLayer;
}

/**
 * Configuration for forgetting
 */
export interface ForgetOptions {
  memoryId?: string;
  olderThan?: number;
  layer?: MemoryLayer;
  reason?: string;
}

/**
 * Vector store interface
 */
export interface IVectorStore {
  /**
   * Initialize the vector store connection
   */
  initialize(): Promise<void>;

  /**
   * Store a memory with its embedding
   */
  store(memory: Memory): Promise<void>;

  /**
   * Store multiple memories
   */
  storeBatch(memories: Memory[]): Promise<void>;

  /**
   * Search for similar memories by embedding
   */
  search(embedding: number[], limit: number, filter?: Record<string, unknown>): Promise<MemorySearchResult[]>;

  /**
   * Get a memory by ID
   */
  get(id: string): Promise<Memory | null>;

  /**
   * Delete a memory by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete multiple memories by IDs
   */
  deleteBatch(ids: string[]): Promise<number>;

  /**
   * List all memories with optional filtering
   */
  list(filter?: Record<string, unknown>): Promise<Memory[]>;

  /**
   * Update a memory
   */
  update(memory: Memory): Promise<void>;

  /**
   * Close the connection
   */
  close(): Promise<void>;
}

/**
 * Embedding provider interface
 */
export interface IEmbeddingProvider {
  /**
   * Generate embedding for text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of the embedding vectors
   */
  getDimensions(): number;
}
