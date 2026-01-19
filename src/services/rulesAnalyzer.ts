/**
 * Rules Analyzer Service
 * 
 * Detects duplicates, conflicts, and outdated patterns in Cursor rules.
 * Uses embeddings for semantic similarity and optional LLM for deeper analysis.
 */

import { createHash } from 'crypto';
import { createEmbedder, type Embedder } from '../adapters/embeddings/index.js';
import { getLLMProvider, type LLMProvider } from '../adapters/llm/index.js';
import type { RAGConfig } from '../types/index.js';
import type {
  ParsedRule,
  DuplicateMatch,
  DuplicateMatchType,
  DuplicateRecommendation,
  RuleCluster,
  RuleConflict,
  ConflictType,
  OutdatedRule,
  OptimizationReport,
  MergeCandidate,
  RulesOptimizerOptions,
} from '../types/rulesOptimizer.js';
import { DEFAULT_OPTIMIZER_OPTIONS } from '../types/rulesOptimizer.js';

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Jaccard similarity between two sets of tags
 */
function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Rules Analyzer for detecting duplicates, conflicts, and outdated patterns
 */
export class RulesAnalyzer {
  private embeddings: Embedder | null = null;
  private llm: LLMProvider | null;
  private config: RAGConfig;
  private options: Required<RulesOptimizerOptions>;
  private ruleEmbeddings: Map<string, number[]> = new Map();

  constructor(
    config: RAGConfig,
    options?: RulesOptimizerOptions
  ) {
    this.config = config;
    this.llm = options?.useLLM !== false ? getLLMProvider() : null;
    this.options = { ...DEFAULT_OPTIMIZER_OPTIONS, ...options } as Required<RulesOptimizerOptions>;
  }

  private async getEmbeddings(): Promise<Embedder> {
    if (!this.embeddings) {
      this.embeddings = await createEmbedder(this.config.embeddings, this.config);
    }
    return this.embeddings;
  }

  /**
   * Analyze rules and generate optimization report
   */
  async analyzeRules(rules: ParsedRule[], analyzedPath: string): Promise<OptimizationReport> {
    const startTime = Date.now();
    
    // Generate embeddings for all rules
    await this.generateEmbeddings(rules);

    // Find duplicates
    const duplicates = await this.findDuplicates(rules);

    // Find clusters
    const clusters = this.findClusters(rules);

    // Find conflicts
    const conflicts = this.options.detectConflicts 
      ? await this.findConflicts(rules)
      : [];

    // Find outdated rules
    const outdated = this.options.detectOutdated
      ? this.findOutdatedRules(rules)
      : [];

    // Generate merge candidates
    const merges = await this.generateMergeCandidates(clusters, duplicates);

    // Calculate statistics
    const totalTokensBefore = rules.reduce((sum, r) => sum + r.tokenCount, 0);
    const estimatedSavings = this.estimateSavings(merges, duplicates);
    const totalTokensAfter = totalTokensBefore - estimatedSavings;

    // Build optimization plan
    const plan = this.buildOptimizationPlan(duplicates, merges, conflicts, outdated);

    // Build file changes
    const fileChanges = this.buildFileChanges(plan, rules);

    return {
      generatedAt: new Date(),
      analyzedPath,
      summary: {
        totalFiles: new Set(rules.map(r => r.sourceFile.path)).size,
        totalRules: rules.length,
        totalTokensBefore,
        totalTokensAfter,
        savingsPercent: totalTokensBefore > 0 
          ? Math.round((estimatedSavings / totalTokensBefore) * 100) 
          : 0,
        duplicatesFound: duplicates.length,
        conflictsFound: conflicts.length,
        mergeCandidates: merges.length,
        outdatedRules: outdated.length,
      },
      findings: {
        duplicates,
        clusters,
        merges,
        conflicts,
        outdated,
      },
      plan,
      fileChanges,
    };
  }

  /**
   * Generate embeddings for all rules
   */
  private async generateEmbeddings(rules: ParsedRule[]): Promise<void> {
    const embedder = await this.getEmbeddings();
    for (const rule of rules) {
      if (!this.ruleEmbeddings.has(rule.id)) {
        const embedding = await embedder.embed(
          `${rule.title}\n\n${rule.content.substring(0, 2000)}`
        );
        this.ruleEmbeddings.set(rule.id, embedding);
      }
    }
  }

  /**
   * Find duplicate and near-duplicate rules
   */
  async findDuplicates(rules: ParsedRule[]): Promise<DuplicateMatch[]> {
    const duplicates: DuplicateMatch[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i]!;
        const rule2 = rules[j]!;
        const pairKey = [rule1.id, rule2.id].sort().join(':');

        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        // Check for exact duplicates (content hash)
        if (rule1.contentHash === rule2.contentHash) {
          duplicates.push({
            rule1,
            rule2,
            similarity: 1.0,
            matchType: 'exact',
            overlappingConcepts: ['Identical content'],
            recommendation: 'keep_newer',
          });
          continue;
        }

        // Check semantic similarity via embeddings
        const emb1 = this.ruleEmbeddings.get(rule1.id);
        const emb2 = this.ruleEmbeddings.get(rule2.id);
        
        if (emb1 && emb2) {
          const similarity = cosineSimilarity(emb1, emb2);
          
          if (similarity >= this.options.duplicateThreshold) {
            const matchType = this.determineMatchType(rule1, rule2, similarity);
            const overlappingConcepts = this.findOverlappingConcepts(rule1, rule2);
            const recommendation = this.determineRecommendation(matchType, rule1, rule2);

            duplicates.push({
              rule1,
              rule2,
              similarity,
              matchType,
              overlappingConcepts,
              recommendation,
            });
          }
        }
      }
    }

    // Sort by similarity descending
    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Find clusters of related rules
   */
  findClusters(rules: ParsedRule[]): RuleCluster[] {
    const clusters: RuleCluster[] = [];
    const clustered = new Set<string>();

    // Group by common tags first
    const tagGroups = new Map<string, ParsedRule[]>();
    for (const rule of rules) {
      for (const tag of rule.tags) {
        const group = tagGroups.get(tag) ?? [];
        group.push(rule);
        tagGroups.set(tag, group);
      }
    }

    // Create clusters from tag groups with multiple rules
    for (const [tag, groupRules] of tagGroups) {
      if (groupRules.length < 2) continue;
      if (groupRules.every(r => clustered.has(r.id))) continue;

      // Check if rules are semantically related
      const avgSimilarity = this.calculateAverageClusterSimilarity(groupRules);
      if (avgSimilarity < 0.5) continue;

      const newRules = groupRules.filter(r => !clustered.has(r.id));
      if (newRules.length < 2) continue;

      const totalTokensSeparate = newRules.reduce((sum, r) => sum + r.tokenCount, 0);
      const estimatedTokensMerged = Math.ceil(totalTokensSeparate * 0.6); // Assume 40% reduction

      clusters.push({
        id: `cluster-${createHash('md5').update(tag).digest('hex').substring(0, 8)}`,
        suggestedName: `${tag.charAt(0).toUpperCase() + tag.slice(1)} Rules`,
        rules: newRules,
        commonTags: [tag],
        topic: tag,
        confidence: avgSimilarity,
        totalTokensSeparate,
        estimatedTokensMerged,
        savingsPercent: Math.round(((totalTokensSeparate - estimatedTokensMerged) / totalTokensSeparate) * 100),
      });

      newRules.forEach(r => clustered.add(r.id));
    }

    return clusters.sort((a, b) => b.savingsPercent - a.savingsPercent);
  }

  /**
   * Find conflicts between rules
   */
  async findConflicts(rules: ParsedRule[]): Promise<RuleConflict[]> {
    const conflicts: RuleConflict[] = [];

    // Common conflict patterns
    const conflictPatterns = [
      { pattern: /\b(always|never|must|must not|do not|don't)\b/gi, type: 'directive' },
      { pattern: /\bprefer\s+(\w+)\b/gi, type: 'preference' },
      { pattern: /\buse\s+(\w+)\s+instead\s+of\s+(\w+)/gi, type: 'replacement' },
      { pattern: /\bv?(\d+\.?\d*\.?\d*)\b/g, type: 'version' },
    ];

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i]!;
        const rule2 = rules[j]!;

        // Check for tag overlap (rules about same topic might conflict)
        const tagOverlap = jaccardSimilarity(new Set(rule1.tags), new Set(rule2.tags));
        if (tagOverlap < 0.3) continue;

        // Check for conflicting directives
        const conflict = this.detectConflict(rule1, rule2, conflictPatterns);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Find outdated rules
   */
  findOutdatedRules(rules: ParsedRule[]): OutdatedRule[] {
    const outdated: OutdatedRule[] = [];

    // Patterns that indicate outdated content
    const outdatedPatterns = [
      { pattern: /\blaravel\s+(\d+)/i, current: '11', tech: 'Laravel' },
      { pattern: /\bphp\s+(\d+\.?\d*)/i, current: '8.3', tech: 'PHP' },
      { pattern: /\bnode\.?js?\s+(\d+)/i, current: '22', tech: 'Node.js' },
      { pattern: /\breact\s+(\d+)/i, current: '19', tech: 'React' },
      { pattern: /\bvue\s+(\d+)/i, current: '3', tech: 'Vue' },
      { pattern: /\bnuxt\s+(\d+)/i, current: '4', tech: 'Nuxt' },
      { pattern: /\btypescript\s+(\d+\.?\d*)/i, current: '5.7', tech: 'TypeScript' },
      { pattern: /\bnext\.?js?\s+(\d+)/i, current: '15', tech: 'Next.js' },
      { pattern: /\btailwind\s+(\d+)/i, current: '4', tech: 'Tailwind' },
    ];

    // Deprecated patterns
    const deprecatedPatterns = [
      { pattern: /\bclass\s+\w+\s+extends\s+Component\b/i, reason: 'Class components are deprecated in React' },
      { pattern: /\bdefineComponent\b/i, reason: 'Vue 2 style defineComponent' },
      { pattern: /\bvar\s+\w+\s*=/g, reason: 'var is deprecated, use const/let' },
      { pattern: /\b(callback|cb)\s*\(/gi, reason: 'Callbacks are outdated, use async/await' },
    ];

    for (const rule of rules) {
      const outdatedReferences: OutdatedRule['outdatedReferences'] = [];
      let maxConfidence = 0;

      // Check version references
      for (const { pattern, current, tech } of outdatedPatterns) {
        const match = rule.content.match(pattern);
        if (match?.[1]) {
          const mentionedVersion = parseFloat(match[1]);
          const currentVersion = parseFloat(current);
          
          if (mentionedVersion < currentVersion) {
            outdatedReferences.push({
              reference: `${tech} ${match[1]}`,
              currentVersion: current,
              suggestedUpdate: `${tech} ${current}`,
            });
            maxConfidence = Math.max(maxConfidence, 0.8);
          }
        }
      }

      // Check deprecated patterns
      for (const { pattern, reason } of deprecatedPatterns) {
        if (pattern.test(rule.content)) {
          outdatedReferences.push({
            reference: reason,
          });
          maxConfidence = Math.max(maxConfidence, 0.6);
        }
      }

      // Check rule age
      const daysSinceModified = (Date.now() - rule.sourceFile.lastModified.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceModified > 365 && outdatedReferences.length === 0) {
        outdatedReferences.push({
          reference: `Rule hasn't been updated in ${Math.floor(daysSinceModified)} days`,
        });
        maxConfidence = Math.max(maxConfidence, 0.4);
      }

      if (outdatedReferences.length > 0) {
        outdated.push({
          rule,
          reason: outdatedReferences.map(r => r.reference).join('; '),
          confidence: maxConfidence,
          action: maxConfidence > 0.7 ? 'update' : 'review',
          outdatedReferences,
        });
      }
    }

    return outdated.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate merge candidates from clusters and duplicates
   */
  private async generateMergeCandidates(
    clusters: RuleCluster[],
    duplicates: DuplicateMatch[]
  ): Promise<MergeCandidate[]> {
    const candidates: MergeCandidate[] = [];

    // Generate candidates from clusters
    for (const cluster of clusters) {
      if (cluster.rules.length < 2) continue;
      if (cluster.confidence < 0.6) continue;

      const mergedContent = this.generateSimpleMerge(cluster.rules);
      const tokensBefore = cluster.totalTokensSeparate;
      const tokensAfter = cluster.estimatedTokensMerged;

      candidates.push({
        rules: cluster.rules,
        mergedContent,
        mergedTitle: cluster.suggestedName,
        mergeRationale: `Rules share common topic: ${cluster.topic}`,
        confidence: cluster.confidence,
        tokensBefore,
        tokensAfter,
        preservedFrom: cluster.rules.map(r => ({
          ruleId: r.id,
          preservedConcepts: r.tags,
        })),
      });
    }

    // Generate candidates from high-similarity duplicates
    for (const dup of duplicates) {
      if (dup.recommendation !== 'merge') continue;
      if (dup.similarity < 0.8) continue;

      const rules = [dup.rule1, dup.rule2];
      const mergedContent = this.generateSimpleMerge(rules);
      const tokensBefore = dup.rule1.tokenCount + dup.rule2.tokenCount;
      const tokensAfter = this.countTokens(mergedContent);

      candidates.push({
        rules,
        mergedContent,
        mergedTitle: dup.rule1.title,
        mergeRationale: `High similarity (${Math.round(dup.similarity * 100)}%) between rules`,
        confidence: dup.similarity,
        tokensBefore,
        tokensAfter,
        preservedFrom: rules.map(r => ({
          ruleId: r.id,
          preservedConcepts: dup.overlappingConcepts,
        })),
      });
    }

    return candidates.sort((a, b) => (b.tokensBefore - b.tokensAfter) - (a.tokensBefore - a.tokensAfter));
  }

  /**
   * Generate simple merged content from rules
   */
  private generateSimpleMerge(rules: ParsedRule[]): string {
    const sections = rules.map(r => {
      const header = `## ${r.title}`;
      return `${header}\n\n${r.content}`;
    });

    return sections.join('\n\n---\n\n');
  }

  /**
   * Determine match type between rules
   */
  private determineMatchType(rule1: ParsedRule, rule2: ParsedRule, similarity: number): DuplicateMatchType {
    if (rule1.contentHash === rule2.contentHash) return 'exact';
    if (similarity > 0.95) return 'near_exact';
    
    // Check if one is subset of other
    const r1Words = new Set(rule1.content.toLowerCase().split(/\s+/));
    const r2Words = new Set(rule2.content.toLowerCase().split(/\s+/));
    
    const r1InR2 = [...r1Words].filter(w => r2Words.has(w)).length / r1Words.size;
    const r2InR1 = [...r2Words].filter(w => r1Words.has(w)).length / r2Words.size;
    
    if (r1InR2 > 0.9 || r2InR1 > 0.9) return 'subset';
    
    return 'semantic';
  }

  /**
   * Find overlapping concepts between rules
   */
  private findOverlappingConcepts(rule1: ParsedRule, rule2: ParsedRule): string[] {
    const concepts: string[] = [];
    
    // Shared tags
    const sharedTags = rule1.tags.filter(t => rule2.tags.includes(t));
    concepts.push(...sharedTags.map(t => `Shared topic: ${t}`));

    // Common code patterns
    const codePatterns = [
      /```(\w+)/g,
      /`([^`]+)`/g,
    ];

    const r1Code = new Set<string>();
    const r2Code = new Set<string>();

    for (const pattern of codePatterns) {
      let match;
      while ((match = pattern.exec(rule1.content)) !== null) {
        if (match[1]) r1Code.add(match[1]);
      }
      pattern.lastIndex = 0;
      while ((match = pattern.exec(rule2.content)) !== null) {
        if (match[1]) r2Code.add(match[1]);
      }
      pattern.lastIndex = 0;
    }

    const sharedCode = [...r1Code].filter(c => r2Code.has(c));
    if (sharedCode.length > 0) {
      concepts.push(`Shared code references: ${sharedCode.slice(0, 3).join(', ')}`);
    }

    return concepts.length > 0 ? concepts : ['Similar content'];
  }

  /**
   * Determine recommendation for duplicate
   */
  private determineRecommendation(
    matchType: DuplicateMatchType,
    rule1: ParsedRule,
    rule2: ParsedRule
  ): DuplicateRecommendation {
    if (matchType === 'exact' || matchType === 'near_exact') {
      // Keep the newer one
      return rule1.sourceFile.lastModified > rule2.sourceFile.lastModified
        ? 'keep_newer'
        : 'keep_newer';
    }

    if (matchType === 'subset') {
      // Keep the more comprehensive one
      return rule1.tokenCount > rule2.tokenCount ? 'keep_specific' : 'keep_specific';
    }

    if (matchType === 'contradicting') {
      return 'resolve_conflict';
    }

    return 'merge';
  }

  /**
   * Detect conflict between two rules
   */
  private detectConflict(
    rule1: ParsedRule,
    rule2: ParsedRule,
    patterns: Array<{ pattern: RegExp; type: string }>
  ): RuleConflict | null {
    const conflictingStatements: RuleConflict['conflictingStatements'] = [];
    let conflictType: ConflictType | null = null;

    // Extract directive statements
    const r1Directives = this.extractDirectives(rule1.content);
    const r2Directives = this.extractDirectives(rule2.content);

    // Check for contradicting directives
    for (const d1 of r1Directives) {
      for (const d2 of r2Directives) {
        if (this.directivesContradict(d1, d2)) {
          conflictingStatements.push({
            from: rule1.title,
            statement1: d1,
            statement2: d2,
          });
          conflictType = 'direct_contradiction';
        }
      }
    }

    // Check for preference conflicts
    const r1Preferences = this.extractPreferences(rule1.content);
    const r2Preferences = this.extractPreferences(rule2.content);

    for (const [topic, pref1] of r1Preferences) {
      const pref2 = r2Preferences.get(topic);
      if (pref2 && pref1 !== pref2) {
        conflictingStatements.push({
          from: rule1.title,
          statement1: `Prefer ${pref1} for ${topic}`,
          statement2: `Prefer ${pref2} for ${topic}`,
        });
        conflictType = conflictType ?? 'preference_conflict';
      }
    }

    if (conflictingStatements.length === 0) return null;

    return {
      rule1,
      rule2,
      conflictType: conflictType!,
      description: `${conflictingStatements.length} conflicting statement(s) found`,
      conflictingStatements,
      resolution: {
        preferredRuleId: rule1.sourceFile.lastModified > rule2.sourceFile.lastModified 
          ? rule1.id 
          : rule2.id,
        reasoning: 'Prefer the more recently modified rule',
      },
    };
  }

  /**
   * Extract directive statements from content
   */
  private extractDirectives(content: string): string[] {
    const directives: string[] = [];
    const patterns = [
      /(?:always|never|must|must not|do not|don't)\s+[^.]+\./gi,
      /(?:use|prefer|avoid)\s+[^.]+\./gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        directives.push(match[0].trim());
      }
    }

    return directives;
  }

  /**
   * Extract preference statements
   */
  private extractPreferences(content: string): Map<string, string> {
    const preferences = new Map<string, string>();
    const pattern = /prefer\s+(\w+)\s+(?:over|instead of|rather than)\s+(\w+)/gi;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[2]) {
        preferences.set(match[2].toLowerCase(), match[1].toLowerCase());
      }
    }

    return preferences;
  }

  /**
   * Check if two directives contradict
   */
  private directivesContradict(d1: string, d2: string): boolean {
    const d1Lower = d1.toLowerCase();
    const d2Lower = d2.toLowerCase();

    // Check for opposite modifiers
    const alwaysNever = (
      (d1Lower.includes('always') && d2Lower.includes('never')) ||
      (d1Lower.includes('never') && d2Lower.includes('always'))
    );

    const mustMustNot = (
      (d1Lower.includes('must ') && d2Lower.includes('must not')) ||
      (d1Lower.includes('must not') && d2Lower.includes('must '))
    );

    // Check if they're about the same topic
    const d1Words = new Set(d1Lower.split(/\W+/).filter(w => w.length > 3));
    const d2Words = new Set(d2Lower.split(/\W+/).filter(w => w.length > 3));
    const overlap = [...d1Words].filter(w => d2Words.has(w));

    return (alwaysNever || mustMustNot) && overlap.length > 2;
  }

  /**
   * Calculate average similarity within a cluster
   */
  private calculateAverageClusterSimilarity(rules: ParsedRule[]): number {
    if (rules.length < 2) return 0;

    let totalSim = 0;
    let count = 0;

    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const emb1 = this.ruleEmbeddings.get(rules[i]!.id);
        const emb2 = this.ruleEmbeddings.get(rules[j]!.id);
        
        if (emb1 && emb2) {
          totalSim += cosineSimilarity(emb1, emb2);
          count++;
        }
      }
    }

    return count > 0 ? totalSim / count : 0;
  }

  /**
   * Estimate token savings from optimizations
   */
  private estimateSavings(
    merges: MergeCandidate[],
    duplicates: DuplicateMatch[]
  ): number {
    let savings = 0;

    // Savings from merges
    for (const merge of merges) {
      savings += merge.tokensBefore - merge.tokensAfter;
    }

    // Savings from duplicate removal (keep one)
    for (const dup of duplicates) {
      if (dup.recommendation === 'keep_newer' || dup.recommendation === 'keep_specific') {
        savings += Math.min(dup.rule1.tokenCount, dup.rule2.tokenCount);
      }
    }

    return Math.max(0, savings);
  }

  /**
   * Build optimization plan
   */
  private buildOptimizationPlan(
    duplicates: DuplicateMatch[],
    merges: MergeCandidate[],
    conflicts: RuleConflict[],
    outdated: OutdatedRule[]
  ): OptimizationReport['plan'] {
    const actions: OptimizationReport['plan']['actions'] = [];
    let priority = 1;

    // Add actions for exact duplicates (safe to auto-apply)
    for (const dup of duplicates.filter(d => d.matchType === 'exact')) {
      const ruleToRemove = dup.rule1.sourceFile.lastModified < dup.rule2.sourceFile.lastModified
        ? dup.rule1
        : dup.rule2;

      actions.push({
        type: 'delete',
        description: `Remove exact duplicate: ${ruleToRemove.title}`,
        affectedRules: [ruleToRemove.id],
        affectedFiles: [ruleToRemove.sourceFile.path],
        tokenImpact: -ruleToRemove.tokenCount,
        priority: priority++,
        autoApplyable: true,
      });
    }

    // Add actions for high-confidence merges
    for (const merge of merges.filter(m => m.confidence > 0.8)) {
      actions.push({
        type: 'merge',
        description: `Merge ${merge.rules.length} rules: ${merge.mergedTitle}`,
        affectedRules: merge.rules.map(r => r.id),
        affectedFiles: [...new Set(merge.rules.map(r => r.sourceFile.path))],
        tokenImpact: -(merge.tokensBefore - merge.tokensAfter),
        priority: priority++,
        autoApplyable: merge.confidence > 0.9,
      });
    }

    // Add actions for conflicts (require review)
    for (const conflict of conflicts) {
      actions.push({
        type: 'review',
        description: `Resolve conflict: ${conflict.description}`,
        affectedRules: [conflict.rule1.id, conflict.rule2.id],
        affectedFiles: [conflict.rule1.sourceFile.path, conflict.rule2.sourceFile.path],
        tokenImpact: 0,
        priority: priority++,
        autoApplyable: false,
      });
    }

    // Add actions for outdated rules
    for (const out of outdated) {
      actions.push({
        type: out.action === 'remove' ? 'delete' : 'update',
        description: `${out.action === 'remove' ? 'Remove' : 'Update'} outdated: ${out.rule.title}`,
        affectedRules: [out.rule.id],
        affectedFiles: [out.rule.sourceFile.path],
        tokenImpact: out.action === 'remove' ? -out.rule.tokenCount : 0,
        priority: priority++,
        autoApplyable: false,
      });
    }

    const hasManualReview = actions.some(a => !a.autoApplyable);
    const riskLevel = conflicts.length > 0 ? 'high' : (duplicates.length > 5 ? 'medium' : 'low');

    return {
      actions,
      estimatedDuration: `${Math.ceil(actions.length * 0.5)} minutes`,
      riskLevel,
      requiresManualReview: hasManualReview,
    };
  }

  /**
   * Build file changes from plan
   */
  private buildFileChanges(
    plan: OptimizationReport['plan'],
    rules: ParsedRule[]
  ): OptimizationReport['fileChanges'] {
    const changes: OptimizationReport['fileChanges'] = [];
    const ruleMap = new Map(rules.map(r => [r.id, r]));

    for (const action of plan.actions) {
      if (action.type === 'delete') {
        for (const ruleId of action.affectedRules) {
          const rule = ruleMap.get(ruleId);
          if (rule) {
            changes.push({
              path: rule.sourceFile.path,
              changeType: 'delete',
              originalContent: rule.sourceFile.content,
            });
          }
        }
      } else if (action.type === 'merge') {
        // First file gets merged content
        const firstFile = action.affectedFiles[0];
        if (firstFile) {
          changes.push({
            path: firstFile,
            changeType: 'modify',
            newContent: '/* Merged content - see optimization report */',
          });
        }
        // Other files deleted
        for (const file of action.affectedFiles.slice(1)) {
          changes.push({
            path: file,
            changeType: 'delete',
          });
        }
      }
    }

    return changes;
  }

  /**
   * Simple token counting
   */
  private countTokens(content: string): number {
    // Rough estimate: 4 chars per token
    return Math.ceil(content.length / 4);
  }
}

/**
 * Singleton instance
 */
let analyzerInstance: RulesAnalyzer | null = null;

export function getRulesAnalyzer(
  config: RAGConfig,
  options?: RulesOptimizerOptions
): RulesAnalyzer {
  if (!analyzerInstance || options) {
    analyzerInstance = new RulesAnalyzer(config, options);
  }
  return analyzerInstance;
}
