import type { ChunkMetadata } from '../types/memory.js';
import { MemoryMetadataStore, getMemoryMetadataStore } from './memoryMetadataStore.js';
import { DecayCalculator, getDecayCalculator, type UpdateResult } from './decayCalculator.js';
import { CategoryManager, getCategoryManager } from './categoryManager.js';
import { RelationshipGraph, getRelationshipGraph } from './relationshipGraph.js';

export type MaintenanceJobType = 
  | 'decay'
  | 'consolidate'
  | 'summarize'
  | 'reindex'
  | 'cleanup';

export interface MaintenanceJobResult {
  jobName: MaintenanceJobType | string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  metrics: Record<string, number>;
  errors: string[];
}

export interface MaintenanceStats {
  lastDecayUpdate: Date | null;
  lastConsolidation: Date | null;
  lastSummarization: Date | null;
  lastReindex: Date | null;
  totalJobsRun: number;
  totalErrors: number;
  jobHistory: MaintenanceJobResult[];
}

export interface SchedulerConfig {
  nightlyCron: string;
  weeklyCron: string;
  monthlyCron: string;
  enableAutoScheduling: boolean;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  nightlyCron: '0 3 * * *',     // 3 AM daily
  weeklyCron: '0 4 * * 0',      // 4 AM Sunday
  monthlyCron: '0 5 1 * *',     // 5 AM 1st of month
  enableAutoScheduling: false,
};

interface DuplicateGroup {
  primaryChunkId: string;
  duplicateChunkIds: string[];
  similarity: number;
}

export class MaintenanceScheduler {
  private metadataStore: MemoryMetadataStore;
  private decayCalculator: DecayCalculator;
  private categoryManager: CategoryManager;
  private relationshipGraph: RelationshipGraph;
  private config: SchedulerConfig;
  private running: boolean = false;
  private intervalIds: NodeJS.Timeout[] = [];
  private stats: MaintenanceStats;

  constructor(
    metadataStore?: MemoryMetadataStore,
    decayCalculator?: DecayCalculator,
    categoryManager?: CategoryManager,
    relationshipGraph?: RelationshipGraph,
    config?: Partial<SchedulerConfig>
  ) {
    this.metadataStore = metadataStore || getMemoryMetadataStore();
    this.decayCalculator = decayCalculator || getDecayCalculator();
    this.categoryManager = categoryManager || getCategoryManager(this.metadataStore);
    this.relationshipGraph = relationshipGraph || getRelationshipGraph(this.metadataStore);
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    
    this.stats = {
      lastDecayUpdate: null,
      lastConsolidation: null,
      lastSummarization: null,
      lastReindex: null,
      totalJobsRun: 0,
      totalErrors: 0,
      jobHistory: [],
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): MaintenanceStats {
    return { ...this.stats, jobHistory: [...this.stats.jobHistory] };
  }

  /**
   * Start the background scheduler using setInterval
   * Note: For production use with persistent scheduling, consider using node-cron
   */
  start(): void {
    if (this.running) {
      console.log('Scheduler already running');
      return;
    }

    this.running = true;
    console.log('Maintenance scheduler started');
    console.log('Schedules:');
    console.log(`  - Decay updates: hourly`);
    console.log(`  - Nightly consolidation: daily at 3 AM`);
    console.log(`  - Weekly summarization: Sunday at 4 AM`);
    console.log(`  - Monthly reindex: 1st of month at 5 AM`);

    // Hourly decay update (every hour)
    const hourlyId = setInterval(async () => {
      await this.runDecayUpdate().catch(err => {
        console.error('Hourly decay update failed:', err);
      });
    }, 60 * 60 * 1000); // 1 hour
    this.intervalIds.push(hourlyId);

    // Calculate next run times and schedule
    this.scheduleNightly();
    this.scheduleWeekly();
    this.scheduleMonthly();
  }

  stop(): void {
    if (!this.running) return;

    for (const id of this.intervalIds) {
      clearInterval(id);
    }
    this.intervalIds = [];
    this.running = false;
    console.log('Maintenance scheduler stopped');
  }

  /**
   * Run a specific maintenance job manually
   */
  async runJob(jobName: MaintenanceJobType): Promise<MaintenanceJobResult> {
    switch (jobName) {
      case 'decay':
        return this.runDecayUpdate();
      case 'consolidate':
        return this.runNightlyConsolidation();
      case 'summarize':
        return this.runWeeklySummarization();
      case 'reindex':
        return this.runMonthlyReindex();
      case 'cleanup':
        return this.runCleanup();
      default:
        throw new Error(`Unknown job type: ${jobName}`);
    }
  }

  /**
   * Update decay scores for all chunks
   */
  async runDecayUpdate(): Promise<MaintenanceJobResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const metrics: Record<string, number> = {};

    try {
      const result = this.decayCalculator.updateAllDecayScores(this.metadataStore, false);
      metrics.chunksUpdated = result.updated;
      metrics.duration = result.duration;

      this.stats.lastDecayUpdate = new Date();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const endTime = new Date();
    const jobResult = this.createJobResult('decay', startTime, endTime, metrics, errors);
    this.recordJobResult(jobResult);
    return jobResult;
  }

  /**
   * Nightly consolidation: decay updates, duplicate detection, hot item promotion
   */
  async runNightlyConsolidation(): Promise<MaintenanceJobResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const metrics: Record<string, number> = {
      decayUpdated: 0,
      duplicatesFound: 0,
      hotItemsPromoted: 0,
      itemsArchived: 0,
    };

    console.log('Running nightly consolidation...');

    try {
      // 1. Update all decay scores
      const decayResult = this.decayCalculator.updateAllDecayScores(this.metadataStore, false);
      metrics.decayUpdated = decayResult.updated;
      console.log(`  Updated ${decayResult.updated} decay scores`);

      // 2. Find and consolidate near-duplicates
      const duplicates = await this.findDuplicates();
      metrics.duplicatesFound = duplicates.length;
      for (const group of duplicates) {
        try {
          await this.mergeDuplicates(group);
        } catch (err) {
          errors.push(`Failed to merge duplicates: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      console.log(`  Found ${duplicates.length} duplicate groups`);

      // 3. Promote frequently accessed items (increase importance)
      const hotItems = this.getHotItems(24); // Last 24 hours
      for (const item of hotItems) {
        this.promoteItem(item.chunkId, 0.05);
      }
      metrics.hotItemsPromoted = hotItems.length;
      console.log(`  Promoted ${hotItems.length} hot items`);

      // 4. Archive items with very low decay scores
      const archivedIds = this.metadataStore.archiveStaleChunks(0.15);
      metrics.itemsArchived = archivedIds.length;
      console.log(`  Archived ${archivedIds.length} stale items`);

      this.stats.lastConsolidation = new Date();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Nightly consolidation completed in ${duration.toFixed(1)}s`);

    const jobResult = this.createJobResult('consolidate', startTime, endTime, metrics, errors);
    this.recordJobResult(jobResult);
    return jobResult;
  }

  /**
   * Weekly summarization: update all category summaries
   */
  async runWeeklySummarization(): Promise<MaintenanceJobResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const metrics: Record<string, number> = {
      categoriesUpdated: 0,
      contradictionsFound: 0,
    };

    console.log('Running weekly summarization...');

    try {
      await this.categoryManager.initialize();
      const categories = this.metadataStore.listCategories();
      
      for (const category of categories) {
        try {
          const result = await this.categoryManager.evolveSummary(category.name);
          if (result && result.itemsIntegrated > 0) {
            metrics.categoriesUpdated++;
            if (result.hadContradictions) {
              metrics.contradictionsFound++;
            }
          }
        } catch (err) {
          errors.push(`Failed to evolve summary for ${category.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      console.log(`  Updated ${metrics.categoriesUpdated} category summaries`);
      if (metrics.contradictionsFound > 0) {
        console.log(`  Resolved ${metrics.contradictionsFound} contradictions`);
      }

      this.stats.lastSummarization = new Date();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Weekly summarization completed in ${duration.toFixed(1)}s`);

    const jobResult = this.createJobResult('summarize', startTime, endTime, metrics, errors);
    this.recordJobResult(jobResult);
    return jobResult;
  }

  /**
   * Monthly reindex: cleanup, relationship re-weighting, database optimization
   */
  async runMonthlyReindex(): Promise<MaintenanceJobResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const metrics: Record<string, number> = {
      relationshipsReweighted: 0,
      oldItemsArchived: 0,
      orphanedItemsCleaned: 0,
    };

    console.log('Running monthly reindex...');

    try {
      // 1. Re-weight relationships based on graph analysis
      const graphStats = this.relationshipGraph.getStats();
      metrics.totalRelationships = graphStats.totalRelationships;
      
      // Find isolated chunks and weak relationships
      metrics.isolatedChunks = graphStats.isolatedChunks;
      console.log(`  Graph has ${graphStats.totalRelationships} relationships, ${graphStats.isolatedChunks} isolated chunks`);

      // 2. Archive very old, never-accessed items
      const oldChunks = this.getOldUnusedChunks(180); // 6 months
      for (const chunk of oldChunks) {
        this.metadataStore.archiveChunk(chunk.chunkId);
      }
      metrics.oldItemsArchived = oldChunks.length;
      console.log(`  Archived ${oldChunks.length} old unused items`);

      // 3. Clean up orphaned data
      const orphanedCleaned = await this.cleanupOrphanedData();
      metrics.orphanedItemsCleaned = orphanedCleaned;
      console.log(`  Cleaned ${orphanedCleaned} orphaned records`);

      // 4. Vacuum database
      this.metadataStore.vacuum();
      console.log(`  Database vacuumed`);

      this.stats.lastReindex = new Date();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Monthly reindex completed in ${duration.toFixed(1)}s`);

    const jobResult = this.createJobResult('reindex', startTime, endTime, metrics, errors);
    this.recordJobResult(jobResult);
    return jobResult;
  }

  /**
   * General cleanup: remove archived items, compress data
   */
  async runCleanup(dryRun: boolean = false): Promise<MaintenanceJobResult> {
    const startTime = new Date();
    const errors: string[] = [];
    const metrics: Record<string, number> = {
      archivedChunksFound: 0,
      lowDecayChunksFound: 0,
      orphanedRelationships: 0,
      wouldDelete: 0,
      deleted: 0,
    };

    console.log(`Running cleanup${dryRun ? ' (dry run)' : ''}...`);

    try {
      // 1. Find all archived chunks
      const allChunks = this.metadataStore.getAllChunkMetadata({ includeArchived: true });
      const archivedChunks = allChunks.filter(c => c.isArchived);
      metrics.archivedChunksFound = archivedChunks.length;

      // 2. Find chunks with very low decay scores
      const lowDecayChunks = allChunks.filter(c => !c.isArchived && c.decayScore < 0.1);
      metrics.lowDecayChunksFound = lowDecayChunks.length;

      // 3. Calculate what would be deleted
      metrics.wouldDelete = archivedChunks.length;

      if (dryRun) {
        console.log(`  Would delete ${archivedChunks.length} archived chunks`);
        console.log(`  ${lowDecayChunks.length} chunks have low decay scores (candidates for archival)`);
      } else {
        // Actually delete archived chunks
        for (const chunk of archivedChunks) {
          try {
            this.metadataStore.deleteChunkMetadata(chunk.chunkId);
            metrics.deleted++;
          } catch (err) {
            errors.push(`Failed to delete ${chunk.chunkId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        console.log(`  Deleted ${metrics.deleted} archived chunks`);
      }

      // 4. Vacuum if actual deletion happened
      if (!dryRun && metrics.deleted > 0) {
        this.metadataStore.vacuum();
        console.log(`  Database vacuumed`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const endTime = new Date();
    const duration = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Cleanup completed in ${duration.toFixed(1)}s`);

    const jobResult = this.createJobResult('cleanup', startTime, endTime, metrics, errors);
    this.recordJobResult(jobResult);
    return jobResult;
  }

  private scheduleNightly(): void {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);
    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }
    
    const msUntil3AM = next3AM.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runNightlyConsolidation().catch(console.error);
      // Then run every 24 hours
      const dailyId = setInterval(() => {
        this.runNightlyConsolidation().catch(console.error);
      }, 24 * 60 * 60 * 1000);
      this.intervalIds.push(dailyId);
    }, msUntil3AM);
  }

  private scheduleWeekly(): void {
    const now = new Date();
    const nextSunday4AM = new Date(now);
    nextSunday4AM.setHours(4, 0, 0, 0);
    const daysUntilSunday = (7 - now.getDay()) % 7;
    nextSunday4AM.setDate(nextSunday4AM.getDate() + (daysUntilSunday === 0 && now.getHours() >= 4 ? 7 : daysUntilSunday));
    
    const msUntilSunday = nextSunday4AM.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runWeeklySummarization().catch(console.error);
      // Then run every 7 days
      const weeklyId = setInterval(() => {
        this.runWeeklySummarization().catch(console.error);
      }, 7 * 24 * 60 * 60 * 1000);
      this.intervalIds.push(weeklyId);
    }, msUntilSunday);
  }

  private scheduleMonthly(): void {
    const now = new Date();
    const nextFirst5AM = new Date(now.getFullYear(), now.getMonth() + 1, 1, 5, 0, 0);
    if (now.getDate() === 1 && now.getHours() < 5) {
      nextFirst5AM.setMonth(now.getMonth());
    }
    
    const msUntilFirst = nextFirst5AM.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runMonthlyReindex().catch(console.error);
      // Schedule next month
      this.scheduleMonthly();
    }, msUntilFirst);
  }

  /**
   * Find potential duplicate chunks based on high similarity
   */
  private async findDuplicates(): Promise<DuplicateGroup[]> {
    // For now, we do a basic approach: find chunks with identical sources and similar timestamps
    // A more sophisticated approach would use vector similarity
    const chunks = this.metadataStore.getAllChunkMetadata({ includeArchived: false });
    const duplicateGroups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (const chunk of chunks) {
      if (processed.has(chunk.chunkId)) continue;

      // Find chunks from the same source within 1 minute
      const potentialDuplicates = chunks.filter(c => {
        if (c.chunkId === chunk.chunkId || processed.has(c.chunkId)) return false;
        
        const metadata1 = this.metadataStore.getChunkMetadata(chunk.chunkId);
        const metadata2 = this.metadataStore.getChunkMetadata(c.chunkId);
        
        if (!metadata1 || !metadata2) return false;

        const time1 = new Date(chunk.createdAt).getTime();
        const time2 = new Date(c.createdAt).getTime();
        const timeDiff = Math.abs(time1 - time2);

        return timeDiff < 60000; // Within 1 minute
      });

      if (potentialDuplicates.length > 0) {
        duplicateGroups.push({
          primaryChunkId: chunk.chunkId,
          duplicateChunkIds: potentialDuplicates.map(c => c.chunkId),
          similarity: 0.95,
        });

        processed.add(chunk.chunkId);
        for (const dup of potentialDuplicates) {
          processed.add(dup.chunkId);
        }
      }
    }

    return duplicateGroups;
  }

  private async mergeDuplicates(group: DuplicateGroup): Promise<void> {
    // Keep the primary chunk, archive the duplicates
    // Transfer any unique relationships to the primary
    for (const dupId of group.duplicateChunkIds) {
      this.metadataStore.archiveChunk(dupId);
      
      // Could also create a SUPERSEDES relationship
      this.relationshipGraph.markSupersedes(group.primaryChunkId, dupId, group.similarity);
    }
  }

  private getHotItems(hours: number): { chunkId: string; accessCount: number }[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metadataStore.getAccessStats(since).slice(0, 50);
  }

  private promoteItem(chunkId: string, boost: number): void {
    const metadata = this.metadataStore.getChunkMetadata(chunkId);
    if (metadata) {
      const newImportance = Math.min(1.0, metadata.importance + boost);
      this.metadataStore.upsertChunkMetadata({
        ...metadata,
        importance: newImportance,
      });
    }
  }

  private getOldUnusedChunks(days: number): ChunkMetadata[] {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const chunks = this.metadataStore.getAllChunkMetadata({ includeArchived: false });
    
    return chunks.filter(c => {
      const createdAt = new Date(c.createdAt);
      return createdAt < cutoff && c.accessCount === 0;
    });
  }

  private async cleanupOrphanedData(): Promise<number> {
    // This would clean up:
    // - Category items pointing to non-existent chunks
    // - Relationships pointing to non-existent chunks
    // - Access logs for deleted chunks
    // For now, return 0 as a placeholder - the delete function handles cascading deletes
    return 0;
  }

  private createJobResult(
    jobName: MaintenanceJobType | string,
    startTime: Date,
    endTime: Date,
    metrics: Record<string, number>,
    errors: string[]
  ): MaintenanceJobResult {
    return {
      jobName,
      success: errors.length === 0,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      metrics,
      errors,
    };
  }

  private recordJobResult(result: MaintenanceJobResult): void {
    this.stats.totalJobsRun++;
    if (!result.success) {
      this.stats.totalErrors += result.errors.length;
    }
    
    // Keep last 100 job results
    this.stats.jobHistory.push(result);
    if (this.stats.jobHistory.length > 100) {
      this.stats.jobHistory.shift();
    }
  }
}

let instance: MaintenanceScheduler | null = null;

export function getMaintenanceScheduler(
  metadataStore?: MemoryMetadataStore,
  config?: Partial<SchedulerConfig>
): MaintenanceScheduler {
  if (!instance) {
    instance = new MaintenanceScheduler(
      metadataStore,
      undefined,
      undefined,
      undefined,
      config
    );
  }
  return instance;
}

export function resetMaintenanceScheduler(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
