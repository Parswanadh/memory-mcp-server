/**
 * Memory Lifecycle Scheduler
 *
 * Handles periodic maintenance tasks like importance decay,
 * layer rebalancing, and consolidation.
 */

import { MemoryManager } from './MemoryManager.js';
import { config } from '../config.js';
import { MemoryLayer } from '../types.js';

export class MemoryScheduler {
  private memoryManager: MemoryManager;
  private intervals: NodeJS.Timeout[];

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.intervals = [];
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    // Importance decay - runs daily
    const decayInterval = setInterval(async () => {
      try {
        await this.memoryManager.applyImportanceDecay();
        console.error('[Memory Scheduler] Applied importance decay');
      } catch (error) {
        console.error('[Memory Scheduler] Error applying importance decay:', error);
      }
    }, config.decay.interval);
    this.intervals.push(decayInterval);

    // Layer rebalancing - runs hourly
    const rebalanceInterval = setInterval(async () => {
      try {
        await this.memoryManager.rebalanceLayers();
        console.error('[Memory Scheduler] Rebalanced memory layers');
      } catch (error) {
        console.error('[Memory Scheduler] Error rebalancing layers:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
    this.intervals.push(rebalanceInterval);

    // Consolidation check - runs every 6 hours
    const consolidationInterval = setInterval(async () => {
      try {
        // Check if consolidation is needed
        const stats = await this.getConsolidationStats();

        if (stats.shortTermCount > config.consolidation.threshold) {
          await this.memoryManager.consolidate({
            layer: MemoryLayer.SHORT_TERM,
            targetSize: config.consolidation.threshold,
          });
          console.error('[Memory Scheduler] Consolidated short-term memories');
        }
      } catch (error) {
        console.error('[Memory Scheduler] Error during consolidation check:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
    this.intervals.push(consolidationInterval);

    console.error('[Memory Scheduler] Started all scheduled tasks');
  }

  /**
   * Get statistics for consolidation decisions
   */
  private async getConsolidationStats(): Promise<{
    shortTermCount: number;
    longTermCount: number;
  }> {
    const shortTermResults = await this.memoryManager.search('', {
      limit: 10000,
      layerFilter: [MemoryLayer.SHORT_TERM],
    });

    const longTermResults = await this.memoryManager.search('', {
      limit: 10000,
      layerFilter: [MemoryLayer.LONG_TERM],
    });

    return {
      shortTermCount: shortTermResults.length,
      longTermCount: longTermResults.length,
    };
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    console.error('[Memory Scheduler] Stopped all scheduled tasks');
  }

  /**
   * Run a single consolidation cycle manually
   */
  async runConsolidation(options?: {
    olderThan?: number;
    targetSize?: number;
    layer?: MemoryLayer;
  }): Promise<void> {
    await this.memoryManager.consolidate(options || {});
  }

  /**
   * Run a single importance decay cycle manually
   */
  async runDecay(): Promise<void> {
    await this.memoryManager.applyImportanceDecay();
  }

  /**
   * Run a single layer rebalancing cycle manually
   */
  async runRebalancing(): Promise<void> {
    await this.memoryManager.rebalanceLayers();
  }
}
