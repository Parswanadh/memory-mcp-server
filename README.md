# Persistent Hierarchical Memory MCP Server

A production-ready Model Context Protocol (MCP) server that provides persistent, hierarchical memory for AI agents. Features semantic similarity search, automatic lifecycle management, and multi-tier storage (working, short-term, long-term memory).

## Features

- **Hierarchical Memory Layers**
  - Working Memory (minutes) - Current context, in-memory cache
  - Short-Term Memory (days/weeks) - Recent interactions, vector store with TTL
  - Long-Term Memory (months) - Consolidated knowledge, permanent storage

- **Semantic Search**
  - Vector similarity search using embeddings
  - Filter by layer, tags, importance
  - Context-aware recall for tasks

- **Automatic Lifecycle Management**
  - Importance scoring with temporal decay
  - Automatic promotion/demotion between layers
  - Consolidation of old memories
  - Forgetting based on TTL and relevance

- **Multiple Backend Support**
  - In-memory (development/testing)
  - Weaviate (self-hosted)
  - Pinecone (managed)

- **Multiple Embedding Providers**
  - OpenAI (text-embedding-3-small)
  - Local TF-IDF based (no external API)

## Installation

```bash
npm install @anthropic-ai/memory-mcp-server
```

Or build from source:

```bash
git clone https://github.com/anthropics/memory-mcp-server.git
cd memory-mcp-server
npm install
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Vector Store Selection (memory, weaviate, pinecone)
VECTOR_STORE_TYPE=memory

# Weaviate Configuration
WEAVIATE_URL=http://localhost:8080
WEAVIATE_API_KEY=optional

# Pinecone Configuration
PINECONE_API_KEY=your-api-key
PINECONE_INDEX=memory-mcp

# Embedding Configuration
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536

# Memory Layer TTL (milliseconds)
WORKING_MEMORY_TTL=1800000          # 30 minutes
SHORT_TERM_MEMORY_TTL=604800000     # 7 days
LONG_TERM_MEMORY_TTL=31536000000    # 1 year

# Consolidation
CONSOLIDATION_THRESHOLD=100         # Memories before consolidation
CONSOLIDATION_AGE=2592000000        # 30 days

# Importance Decay
DECAY_RATE=0.1                      # Exponential decay rate
DECAY_INTERVAL=86400000             # Daily decay
```

## Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["path/to/memory-mcp-server/build/index.js"],
      "env": {
        "VECTOR_STORE_TYPE": "memory",
        "EMBEDDING_PROVIDER": "openai",
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Tools

### memory_store

Store information in persistent memory with metadata.

**Parameters:**
- `content` (string, required): The content to store
- `importance` (number, 0-1, default: 0.5): Importance score
- `tags` (array of strings, default: []): Category tags
- `source` (string: "user"|"agent"|"system", default: "agent"): Source
- `layer` (string: "working"|"short-term"|"long-term"): Explicit layer

**Example:**
```typescript
await memory_store({
  content: "User prefers concise responses with code examples",
  importance: 0.9,
  tags: ["preferences", "communication-style"]
})
```

### memory_search

Search for memories using semantic similarity.

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, default: 10): Max results
- `layerFilter` (array of strings): Filter by layers
- `minRelevance` (number, 0-1, default: 0): Minimum similarity threshold
- `tags` (array of strings): Filter by tags

**Example:**
```typescript
await memory_search({
  query: "user preferences for code formatting",
  limit: 5,
  minRelevance: 0.5
})
```

### memory_recall

Retrieve context-relevant memories for a specific task.

**Parameters:**
- `task` (string, required): Task description
- `context` (string, optional): Additional context
- `limit` (number, default: 10): Max memories

**Example:**
```typescript
await memory_recall({
  task: "Help debug a React component",
  context: "User is working on a dashboard project",
  limit: 10
})
```

### memory_consolidate

Summarize and compress old memories.

**Parameters:**
- `olderThan` (number, optional): Timestamp filter
- `targetSize` (number, default: 50): Target count
- `layer` (string, default: "short-term"): Layer to consolidate

**Example:**
```typescript
await memory_consolidate({
  targetSize: 50,
  layer: "short-term"
})
```

### memory_forget

Delete memories explicitly or by criteria.

**Parameters:**
- `memoryId` (string, optional): Specific memory ID
- `olderThan` (number, optional): Timestamp filter
- `layer` (string, optional): Layer to clear
- `reason` (string, optional): Audit reason

**Example:**
```typescript
await memory_forget({
  olderThan: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
  layer: "working",
  reason: "Cleanup expired working memories"
})
```

### memory_list

List all stored memories with filtering.

**Parameters:**
- `layer` (string, optional): Filter by layer
- `tags` (array of strings, optional): Filter by tags
- `limit` (number, default: 100): Max results

### memory_stats

Get statistics about stored memories.

**Returns:**
- `totalMemories`: Total count
- `byLayer`: Count per layer
- `avgImportance`: Average importance
- `oldestMemory`: Oldest timestamp
- `newestMemory`: Newest timestamp

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Memory MCP Server                         │
├─────────────────────────────────────────────────────────────┤
│  Memory Layers:                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Working      │  │ Short-Term   │  │ Long-Term    │      │
│  │ (30 min TTL) │  │ (7 day TTL)  │  │ (1 year TTL) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                  │              │
│         └─────────────────┴──────────────────┘              │
│                           │                                 │
│                   ┌───────▼────────┐                        │
│                   │ Vector Store   │                        │
│                   │ (Memory/       │                        │
│                   │  Weaviate/     │                        │
│                   │  Pinecone)     │                        │
│                   └────────────────┘                        │
│                                                           │
│  Lifecycle:                                               │
│  - Semantic search (cosine similarity)                    │
│  - Temporal decay (forgetting curve)                      │
│  - Importance scoring (attention mechanism)               │
│  - Consolidation (summarization)                          │
│  - Automatic promotion/demotion                           │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run watch

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Memory Lifecycle

1. **Storage**
   - New memories are assigned a layer based on importance
   - Embeddings are generated for semantic search
   - Metadata includes timestamp, importance, source, tags

2. **Access**
   - Each access updates access count and last accessed time
   - Frequently accessed memories are promoted to higher layers

3. **Decay**
   - Importance scores decay over time (exponential decay)
   - Low-importance, old memories are demoted or deleted

4. **Consolidation**
   - Old memories are grouped by topic
   - Groups are summarized into single memories
   - Original memories are deleted

5. **Forgetting**
   - TTL-based expiration
   - Explicit deletion
   - Bulk cleanup by layer or timestamp

## Vector Store Backends

### In-Memory (Default)

Best for:
- Development and testing
- Small-scale deployments
- No infrastructure setup

Limitations:
- Not persistent across restarts
- Limited by available RAM

### Weaviate

Best for:
- Self-hosted deployments
- Full control over data
- Hybrid search capabilities

Setup:
```bash
docker run -p 8080:8080 weaviate/weaviate:latest
```

### Pinecone

Best for:
- Production deployments
- Managed service
- Auto-scaling

Setup:
```bash
# Create index via Pinecone console
# Configure PINECONE_API_KEY and PINECONE_INDEX
```

## Embedding Providers

### OpenAI (Recommended)

- `text-embedding-3-small`: 1536 dimensions, fast, cost-effective
- Requires API key
- Best semantic quality

### Local (Development Only)

- TF-IDF based embeddings
- No external API required
- Lower semantic quality
- 512 dimensions

## Best Practices

1. **Use Appropriate Importance Scores**
   - 1.0: Critical information (user preferences, API keys)
   - 0.7-0.9: Important context (project details, goals)
   - 0.4-0.6: General information (conversations, observations)
   - 0.1-0.3: Transient information (temporary notes)

2. **Tag Your Memories**
   - Use descriptive tags for easy retrieval
   - Include category, project, or user identifiers
   - Tag with "consolidated" after consolidation

3. **Regular Consolidation**
   - Run weekly for active systems
   - Adjust targetSize based on storage needs
   - Review consolidated memories for quality

4. **Monitor Memory Health**
   - Use `memory_stats` to check distribution
   - Watch for memory bloat in any layer
   - Adjust TTL values as needed

## Troubleshooting

### Issue: "Vector store not initialized"

**Solution:** Check your environment variables and vector store configuration.

### Issue: "OpenAI API error"

**Solution:** Verify your OPENAI_API_KEY is valid and has API credits.

### Issue: "No relevant memories found"

**Solution:**
- Check if memories exist with `memory_list`
- Try lowering `minRelevance` threshold
- Use broader search queries

### Issue: "Memory layer is full"

**Solution:**
- Run `memory_consolidate` to compress old memories
- Adjust TTL values in configuration
- Use `memory_forget` to clean up

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests to the main repository.

## Support

- GitHub Issues: https://github.com/anthropics/memory-mcp-server/issues
- MCP Documentation: https://github.com/modelcontextprotocol
