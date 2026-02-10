/**
 * MCP Tool Definitions for the Persistent Memory Server
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  MemoryStoreOptions,
  MemorySearchOptions,
  ConsolidationOptions,
  ForgetOptions,
  MemoryLayer,
  MemorySource,
} from './types.js';

/**
 * Tool: Store a memory
 */
export const memoryStoreTool: Tool = {
  name: 'memory_store',
  description: `Store information in persistent memory with metadata.

This tool stores new information in the hierarchical memory system. The memory will be
placed in the appropriate layer (working, short-term, or long-term) based on importance.

Best practices:
- Use importance 1.0 for critical information (user preferences, key decisions)
- Use importance 0.7-0.9 for important context (project details, goals)
- Use importance 0.4-0.6 for general information (conversations, observations)
- Use importance 0.1-0.3 for transient information (temporary notes)
- Include relevant tags for easy retrieval

Security notes:
- Content is sanitized to prevent injection attacks
- Maximum content length is 10,000 characters
- Tags are validated and limited to 50 items
- All inputs are strictly typed and validated`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The content to store in memory. Be specific and include relevant context. Max length: 10,000 characters.',
        maxLength: 10000,
      },
      importance: {
        type: 'number',
        description: 'Importance score from 0 to 1. Higher values indicate more important memories.',
        minimum: 0,
        maximum: 1,
        default: 0.5,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 50 },
        description: 'Tags for categorizing and retrieving the memory later. Max 50 tags, each max 50 characters.',
        maxItems: 50,
        default: [],
      },
      source: {
        type: 'string',
        enum: ['user', 'agent', 'system'],
        description: 'Source of the memory',
        default: 'agent',
      },
      layer: {
        type: 'string',
        enum: ['working', 'short-term', 'long-term'],
        description: 'Explicitly set the memory layer. If not provided, will be auto-determined.',
      },
    },
    required: ['content'],
  },
};

/**
 * Tool: Search memories
 */
export const memorySearchTool: Tool = {
  name: 'memory_search',
  description: `Search for memories using semantic similarity.

This tool performs a semantic search across stored memories, finding the most relevant
results based on meaning rather than exact keyword matching.

Best practices:
- Use specific, descriptive queries for better results
- Filter by layer when you know the timeframe
- Use tags to narrow down search scope
- Adjust minRelevance to filter out low-quality matches

Security notes:
- Query is sanitized to prevent injection attacks
- Maximum query length is 1,000 characters
- Limit is capped at 100 results
- Special characters are filtered for GraphQL safety`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Uses semantic similarity, not keyword matching. Max length: 1,000 characters.',
        maxLength: 1000,
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return.',
        minimum: 1,
        maximum: 100,
        default: 10,
      },
      layerFilter: {
        type: 'array',
        items: { type: 'string', enum: ['working', 'short-term', 'long-term'] },
        description: 'Only search in specific memory layers.',
      },
      minRelevance: {
        type: 'number',
        description: 'Minimum relevance threshold (0-1). Results below this are filtered out.',
        minimum: 0,
        maximum: 1,
        default: 0,
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only return memories with these tags.',
      },
    },
    required: ['query'],
  },
};

/**
 * Tool: Recall context-relevant memories
 */
export const memoryRecallTool: Tool = {
  name: 'memory_recall',
  description: `Retrieve context-relevant memories for a specific task.

This tool is designed to fetch memories that are relevant to a specific task or context.
It combines semantic search with task-aware ranking to provide the most useful memories.

Best practices:
- Clearly describe the task you're working on
- Include relevant context (project, user, etc.)
- Use this tool at the start of complex tasks to establish context`,
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Description of the task or goal.',
      },
      context: {
        type: 'string',
        description: 'Additional context to help find relevant memories.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to retrieve.',
        minimum: 1,
        maximum: 50,
        default: 10,
      },
    },
    required: ['task'],
  },
};

/**
 * Tool: Consolidate old memories
 */
export const memoryConsolidateTool: Tool = {
  name: 'memory_consolidate',
  description: `Summarize and compress old memories.

This tool consolidates older memories into summaries, reducing storage requirements
while preserving important information. Low-importance, infrequently accessed memories
are grouped by topic and summarized.

Best practices:
- Run consolidation periodically (e.g., weekly) to manage memory growth
- Use olderThan to target very old memories
- Set appropriate targetSize to balance detail vs. storage
- Consolidate short-term memories before they age out`,
  inputSchema: {
    type: 'object',
    properties: {
      olderThan: {
        type: 'number',
        description: 'Timestamp in milliseconds. Only consolidate memories older than this.',
      },
      targetSize: {
        type: 'number',
        description: 'Target number of memories to keep after consolidation.',
        minimum: 1,
        maximum: 1000,
        default: 50,
      },
      layer: {
        type: 'string',
        enum: ['working', 'short-term', 'long-term'],
        description: 'Layer to consolidate. Defaults to short-term.',
        default: 'short-term',
      },
    },
    required: [],
  },
};

/**
 * Tool: Forget memories
 */
export const memoryForgetTool: Tool = {
  name: 'memory_forget',
  description: `Delete memories explicitly or based on criteria.

This tool removes memories from storage. Use with caution - deleted memories cannot be recovered.

Best practices:
- Use memoryId to delete specific, known memories
- Use olderThan to clean up expired, low-value memories
- Use layer to clear an entire memory layer
- Always provide a reason for audit purposes`,
  inputSchema: {
    type: 'object',
    properties: {
      memoryId: {
        type: 'string',
        description: 'Specific memory ID to delete.',
      },
      olderThan: {
        type: 'number',
        description: 'Delete memories older than this timestamp (milliseconds).',
      },
      layer: {
        type: 'string',
        enum: ['working', 'short-term', 'long-term'],
        description: 'Delete all memories in this layer.',
      },
      reason: {
        type: 'string',
        description: 'Reason for deletion (for audit purposes).',
      },
    },
    required: [],
  },
};

/**
 * Tool: List all memories with filtering
 */
export const memoryListTool: Tool = {
  name: 'memory_list',
  description: `List all stored memories with optional filtering.

This tool provides a comprehensive view of stored memories. Use filtering to narrow down results.`,
  inputSchema: {
    type: 'object',
    properties: {
      layer: {
        type: 'string',
        enum: ['working', 'short-term', 'long-term'],
        description: 'Filter by memory layer.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (memories must have all specified tags).',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to return.',
        minimum: 1,
        maximum: 1000,
        default: 100,
      },
    },
    required: [],
  },
};

/**
 * Tool: Get memory statistics
 */
export const memoryStatsTool: Tool = {
  name: 'memory_stats',
  description: `Get statistics about stored memories.

Returns aggregate statistics including memory counts by layer, importance distribution,
and storage metrics. Useful for monitoring memory health and consolidation needs.`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Export all tools
 */
export const allTools: Tool[] = [
  memoryStoreTool,
  memorySearchTool,
  memoryRecallTool,
  memoryConsolidateTool,
  memoryForgetTool,
  memoryListTool,
  memoryStatsTool,
];

/**
 * Tool handler type
 */
export interface ToolHandlers {
  memory_store: (args: { content: string } & MemoryStoreOptions) => Promise<{
    memoryId: string;
    timestamp: number;
    layer: MemoryLayer;
  }>;
  memory_search: (
    args: { query: string } & MemorySearchOptions
  ) => Promise<
    Array<{
      id: string;
      content: string;
      relevance: number;
      metadata: {
        timestamp: number;
        importance: number;
        source: MemorySource;
        tags: string[];
        layer: MemoryLayer;
      };
    }>
  >;
  memory_recall: (args: {
    task: string;
    context?: string;
    limit?: number;
  }) => Promise<{
    relevantMemories: unknown[];
    summary: string;
  }>;
  memory_consolidate: (args: ConsolidationOptions) => Promise<{
    consolidated: Array<{
      id: string;
      content: string;
      layer: MemoryLayer;
    }>;
    deleted: string[];
    summary: string;
  }>;
  memory_forget: (args: ForgetOptions) => Promise<{
    deleted: string[];
    reason: string;
  }>;
  memory_list: (args: {
    layer?: MemoryLayer;
    tags?: string[];
    limit?: number;
  }) => Promise<
    Array<{
      id: string;
      content: string;
      metadata: {
        timestamp: number;
        importance: number;
        tags: string[];
        layer: MemoryLayer;
      };
    }>
  >;
  memory_stats: () => Promise<{
    totalMemories: number;
    byLayer: Record<string, number>;
    avgImportance: number;
    oldestMemory?: number;
    newestMemory?: number;
  }>;
}
