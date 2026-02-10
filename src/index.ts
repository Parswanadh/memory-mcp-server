/**
 * Persistent Hierarchical Memory MCP Server
 *
 * A Model Context Protocol server that provides persistent, hierarchical memory
 * for AI agents with semantic search and automatic lifecycle management.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { allTools, ToolHandlers } from './tools.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { MemoryScheduler } from './memory/Scheduler.js';
import { createVectorStore } from './vectorstore/index.js';
import { createEmbeddingProvider } from './embeddings/index.js';
import { config } from './config.js';
import {
  Memory,
  MemoryLayer,
  MemorySource,
  MemoryStoreOptions,
  MemorySearchOptions,
  ConsolidationOptions,
  ForgetOptions,
  MemorySearchResult,
} from './types.js';
import {
  sanitizeString,
  sanitizeQuery,
  validateImportance,
  validateLimit,
  validateLayer,
  validateSource,
  validateTags,
  validateTimestamp,
  sanitizeFilter,
} from './validation.js';

/**
 * Main Memory MCP Server class
 */
class MemoryMCPServer {
  private server: Server;
  private memoryManager: MemoryManager | null = null;
  private scheduler: MemoryScheduler | null = null;
  private embeddingProvider: ReturnType<typeof createEmbeddingProvider> | null = null;

  constructor() {
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize the server and memory manager
   */
  async initialize(): Promise<void> {
    try {
      // Initialize embedding provider
      this.embeddingProvider = createEmbeddingProvider();

      // Initialize vector store with correct dimensions
      const vectorStore = createVectorStore(this.embeddingProvider.getDimensions());

      // Initialize memory manager
      this.memoryManager = new MemoryManager(vectorStore, this.embeddingProvider);
      await this.memoryManager.initialize();

      // Initialize scheduler
      this.scheduler = new MemoryScheduler(this.memoryManager);
      this.scheduler.start();

      console.error(`[Memory MCP] Server initialized successfully`);
      console.error(`[Memory MCP] Vector store: ${config.vectorStoreType}`);
      console.error(`[Memory MCP] Embedding provider: ${config.embedding.provider}`);
    } catch (error) {
      console.error(`[Memory MCP] Initialization error: ${error}`);
      throw error;
    }
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allTools,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.memoryManager) {
        throw new Error('Memory manager not initialized');
      }

      try {
        switch (name) {
          case 'memory_store':
            return await this.handleMemoryStore(args as unknown as { content: string } & MemoryStoreOptions);

          case 'memory_search':
            return await this.handleMemorySearch(
              args as unknown as { query: string } & MemorySearchOptions
            );

          case 'memory_recall':
            return await this.handleMemoryRecall(args as unknown as {
              task: string;
              context?: string;
              limit?: number;
            });

          case 'memory_consolidate':
            return await this.handleMemoryConsolidate(args as unknown as ConsolidationOptions);

          case 'memory_forget':
            return await this.handleMemoryForget(args as unknown as ForgetOptions);

          case 'memory_list':
            return await this.handleMemoryList(args as unknown as {
              layer?: MemoryLayer;
              tags?: string[];
              limit?: number;
            });

          case 'memory_stats':
            return await this.handleMemoryStats();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Memory MCP] Tool execution error: ${errorMessage}`);
        throw new Error(`Tool execution failed: ${errorMessage}`);
      }
    });
  }

  /**
   * Handle memory_store tool calls
   */
  private async handleMemoryStore(
    args: { content: string } & MemoryStoreOptions
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      // Validate and sanitize content
      const content = sanitizeString(args.content, 10000);

      // Validate and sanitize options
      const validatedOptions: MemoryStoreOptions = {};

      if (args.importance !== undefined) {
        validatedOptions.importance = validateImportance(args.importance);
      }

      if (args.tags !== undefined) {
        validatedOptions.tags = validateTags(args.tags);
      }

      if (args.source !== undefined) {
        validatedOptions.source = validateSource(args.source) as MemorySource;
      }

      if (args.layer !== undefined) {
        validatedOptions.layer = validateLayer(args.layer) as MemoryLayer;
      }

      const memory = await this.memoryManager!.store(content, validatedOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                memoryId: memory.id,
                timestamp: memory.metadata.timestamp,
                layer: memory.metadata.layer,
                message: 'Memory stored successfully',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_search tool calls
   */
  private async handleMemorySearch(
    args: { query: string } & MemorySearchOptions
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      // Validate and sanitize query
      const query = sanitizeQuery(args.query);

      // Validate and sanitize options
      const validatedOptions: MemorySearchOptions = {
        limit: validateLimit(args.limit, 10, 100),
      };

      if (args.layerFilter !== undefined) {
        if (!Array.isArray(args.layerFilter)) {
          throw new Error('layerFilter must be an array');
        }
        validatedOptions.layerFilter = args.layerFilter.map(l => validateLayer(l) as MemoryLayer);
      }

      if (args.tags !== undefined) {
        validatedOptions.tags = validateTags(args.tags);
      }

      if (args.minRelevance !== undefined) {
        validatedOptions.minRelevance = validateImportance(args.minRelevance);
      }

      const results = await this.memoryManager!.search(query, validatedOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                count: results.length,
                results: results.map(r => ({
                  id: r.id,
                  content: r.content,
                  relevance: Math.round(r.relevance * 1000) / 1000,
                  timestamp: r.metadata.timestamp,
                  importance: r.metadata.importance,
                  tags: r.metadata.tags,
                  layer: r.metadata.layer,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_recall tool calls
   */
  private async handleMemoryRecall(args: {
    task: string;
    context?: string;
    limit?: number;
  }): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      // Validate and sanitize task
      const task = sanitizeString(args.task, 1000);

      if (task.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: Task description cannot be empty' }],
          isError: true,
        };
      }

      // Validate context if provided
      const context = args.context !== undefined
        ? sanitizeString(args.context, 5000)
        : undefined;

      // Validate limit
      const limit = validateLimit(args.limit, 10, 50);

      const { relevantMemories, summary } = await this.memoryManager!.recall(task, context, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                task,
                summary,
                memories: relevantMemories.map(r => ({
                  id: r.id,
                  content: r.content,
                  relevance: Math.round(r.relevance * 1000) / 1000,
                  timestamp: r.metadata.timestamp,
                  importance: r.metadata.importance,
                  tags: r.metadata.tags,
                  layer: r.metadata.layer,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_consolidate tool calls
   */
  private async handleMemoryConsolidate(
    args: ConsolidationOptions
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      const validatedOptions: ConsolidationOptions = {};

      if (args.olderThan !== undefined) {
        validatedOptions.olderThan = validateTimestamp(args.olderThan);
      }

      if (args.targetSize !== undefined) {
        validatedOptions.targetSize = validateLimit(args.targetSize, 50, 1000);
      }

      if (args.layer !== undefined) {
        validatedOptions.layer = validateLayer(args.layer) as MemoryLayer;
      }

      const result = await this.memoryManager!.consolidate(validatedOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: result.summary,
                consolidated: result.consolidated.map(m => ({
                  id: m.id,
                  content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
                  layer: m.metadata.layer,
                })),
                deletedCount: result.deleted.length,
                deleted: result.deleted,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_forget tool calls
   */
  private async handleMemoryForget(
    args: ForgetOptions
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      if (!args.memoryId && !args.olderThan && !args.layer) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Must specify at least one of: memoryId, olderThan, or layer',
            },
          ],
          isError: true,
        };
      }

      const validatedOptions: ForgetOptions = {};

      if (args.memoryId !== undefined) {
        if (typeof args.memoryId !== 'string') {
          throw new Error('memoryId must be a string');
        }
        validatedOptions.memoryId = args.memoryId;
      }

      if (args.olderThan !== undefined) {
        validatedOptions.olderThan = validateTimestamp(args.olderThan);
      }

      if (args.layer !== undefined) {
        validatedOptions.layer = validateLayer(args.layer) as MemoryLayer;
      }

      if (args.reason !== undefined) {
        validatedOptions.reason = sanitizeString(args.reason, 500);
      }

      const result = await this.memoryManager!.forget(validatedOptions);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                deletedCount: result.deleted.length,
                deleted: result.deleted,
                reason: result.reason,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_list tool calls
   */
  private async handleMemoryList(args: {
    layer?: MemoryLayer;
    tags?: string[];
    limit?: number;
  }): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      const limit = validateLimit(args.limit, 100, 1000);
      let layer: MemoryLayer | undefined;
      let tags: string[] | undefined;

      if (args.layer !== undefined) {
        layer = validateLayer(args.layer) as MemoryLayer;
      }

      if (args.tags !== undefined) {
        tags = validateTags(args.tags);
      }

      let memories: Memory[] = [];

      if (this.memoryManager) {
        // We need to add a list method to MemoryManager or use vector store directly
        // For now, we'll use search with a generic query
        const searchResults = await this.memoryManager.search('', {
          limit: limit * 10, // Get more to filter
          layerFilter: layer ? [layer] : undefined,
          tags,
        });

        memories = searchResults.map(r => ({
          id: r.id,
          content: r.content,
          metadata: r.metadata,
        }));

        memories = memories.slice(0, limit);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: memories.length,
                memories: memories.map(m => ({
                  id: m.id,
                  content: m.content.substring(0, 300) + (m.content.length > 300 ? '...' : ''),
                  timestamp: m.metadata.timestamp,
                  importance: m.metadata.importance,
                  tags: m.metadata.tags,
                  layer: m.metadata.layer,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * Handle memory_stats tool calls
   */
  private async handleMemoryStats(): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    // Get stats by searching for all memories
    const workingStats = await this.memoryManager!.search('', {
      limit: 10000,
      layerFilter: [MemoryLayer.WORKING],
    });

    const shortTermStats = await this.memoryManager!.search('', {
      limit: 10000,
      layerFilter: [MemoryLayer.SHORT_TERM],
    });

    const longTermStats = await this.memoryManager!.search('', {
      limit: 10000,
      layerFilter: [MemoryLayer.LONG_TERM],
    });

    const allMemories = [...workingStats, ...shortTermStats, ...longTermStats];

    let totalImportance = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const m of allMemories) {
      totalImportance += m.metadata.importance;
      if (m.metadata.timestamp < oldestTimestamp) {
        oldestTimestamp = m.metadata.timestamp;
      }
      if (m.metadata.timestamp > newestTimestamp) {
        newestTimestamp = m.metadata.timestamp;
      }
    }

    const stats = {
      totalMemories: allMemories.length,
      byLayer: {
        working: workingStats.length,
        'short-term': shortTermStats.length,
        'long-term': longTermStats.length,
      },
      avgImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      oldestMemory: oldestTimestamp !== Date.now() ? oldestTimestamp : undefined,
      newestMemory: newestTimestamp !== 0 ? newestTimestamp : undefined,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`[Memory MCP] Server started`);
    console.error(`[Memory MCP] Listening for requests...`);
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.scheduler) {
      this.scheduler.stop();
    }
    if (this.memoryManager) {
      await this.memoryManager.close();
    }
    await this.server.close();
    console.error(`[Memory MCP] Server stopped`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = new MemoryMCPServer();

  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error(`[Memory MCP] Fatal error: ${error}`);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error(`[Memory MCP] Received SIGINT, shutting down...`);
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error(`[Memory MCP] Received SIGTERM, shutting down...`);
    await server.stop();
    process.exit(0);
  });
}

// Start the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MemoryMCPServer };
