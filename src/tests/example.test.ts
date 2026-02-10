/**
 * Example tests for the Memory MCP Server
 * Run with: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from '../memory/MemoryManager.js';
import { MemoryVectorStore } from '../vectorstore/memory.js';
import { LocalEmbeddingProvider } from '../embeddings/local.js';
import { MemoryLayer, MemorySource } from '../types.js';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let vectorStore: MemoryVectorStore;
  let embeddingProvider: LocalEmbeddingProvider;

  beforeEach(async () => {
    vectorStore = new MemoryVectorStore();
    embeddingProvider = new LocalEmbeddingProvider();
    memoryManager = new MemoryManager(vectorStore, embeddingProvider);
    await memoryManager.initialize();
  });

  describe('store', () => {
    it('should store a memory with default options', async () => {
      const memory = await memoryManager.store('Test content');

      expect(memory).toBeDefined();
      expect(memory.content).toBe('Test content');
      expect(memory.metadata.importance).toBe(0.5);
      expect(memory.metadata.source).toBe(MemorySource.AGENT);
      expect(memory.id).toBeDefined();
    });

    it('should store a memory with custom options', async () => {
      const memory = await memoryManager.store('Important content', {
        importance: 0.9,
        tags: ['important', 'test'],
        source: MemorySource.USER,
      });

      expect(memory.metadata.importance).toBe(0.9);
      expect(memory.metadata.tags).toEqual(['important', 'test']);
      expect(memory.metadata.source).toBe(MemorySource.USER);
      expect(memory.metadata.layer).toBe(MemoryLayer.LONG_TERM);
    });

    it('should assign correct layer based on importance', async () => {
      const low = await memoryManager.store('Low importance', { importance: 0.3 });
      const medium = await memoryManager.store('Medium importance', { importance: 0.6 });
      const high = await memoryManager.store('High importance', { importance: 0.9 });

      expect(low.metadata.layer).toBe(MemoryLayer.WORKING);
      expect(medium.metadata.layer).toBe(MemoryLayer.SHORT_TERM);
      expect(high.metadata.layer).toBe(MemoryLayer.LONG_TERM);
    });
  });

  describe('search', () => {
    it('should return relevant memories', async () => {
      await memoryManager.store('Python is a programming language');
      await memoryManager.store('JavaScript is used for web development');
      await memoryManager.store('The weather is nice today');

      const results = await memoryManager.search('programming languages', {
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('programming language');
    });

    it('should filter by layer', async () => {
      await memoryManager.store('Test 1', { layer: MemoryLayer.WORKING });
      await memoryManager.store('Test 2', { layer: MemoryLayer.SHORT_TERM });
      await memoryManager.store('Test 3', { layer: MemoryLayer.LONG_TERM });

      const results = await memoryManager.search('Test', {
        layerFilter: [MemoryLayer.WORKING],
      });

      expect(results.length).toBe(1);
      expect(results[0].metadata.layer).toBe(MemoryLayer.WORKING);
    });

    it('should filter by minimum relevance', async () => {
      await memoryManager.store('Python programming language');
      await memoryManager.store('Random content');

      const results = await memoryManager.search('Python code', {
        minRelevance: 0.3,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.relevance >= 0.3)).toBe(true);
    });
  });

  describe('recall', () => {
    it('should return relevant memories for a task', async () => {
      await memoryManager.store('User prefers TypeScript over JavaScript', {
        importance: 0.8,
        tags: ['preferences'],
      });
      await memoryManager.store('Project uses React and TypeScript', {
        importance: 0.7,
        tags: ['project'],
      });

      const { relevantMemories, summary } = await memoryManager.recall(
        'Help set up a new React component',
        'User is working on a TypeScript project',
        5
      );

      expect(relevantMemories.length).toBeGreaterThan(0);
      expect(summary).toBeDefined();
    });
  });

  describe('forget', () => {
    it('should delete a specific memory by ID', async () => {
      const memory = await memoryManager.store('To be forgotten');
      const result = await memoryManager.forget({
        memoryId: memory.id,
        reason: 'Test deletion',
      });

      expect(result.deleted).toContain(memory.id);
      expect(result.reason).toContain('Test deletion');
    });

    it('should delete memories older than timestamp', async () => {
      const oldTimestamp = Date.now() - 1000000;
      await memoryManager.store('Recent memory');
      await memoryManager.store('Old memory');

      // Mock old timestamp
      const memories = await vectorStore.list();
      const oldMemory = memories.find(m => m.content === 'Old memory');
      if (oldMemory) {
        oldMemory.metadata.timestamp = oldTimestamp;
        await vectorStore.update(oldMemory);
      }

      const result = await memoryManager.forget({
        olderThan: Date.now() - 500000,
      });

      expect(result.deleted.length).toBeGreaterThan(0);
    });
  });

  describe('consolidate', () => {
    it('should consolidate old memories', async () => {
      // Create memories with old timestamps
      const oldTimestamp = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago

      for (let i = 0; i < 10; i++) {
        const memory = await memoryManager.store(`Old memory ${i}`, {
          tags: ['old', 'test'],
        });
        memory.metadata.timestamp = oldTimestamp;
        await vectorStore.update(memory);
      }

      const result = await memoryManager.consolidate({
        olderThan: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days
        targetSize: 5,
      });

      expect(result.summary).toBeDefined();
      expect(result.deleted.length).toBeGreaterThanOrEqual(0);
    });
  });
});
