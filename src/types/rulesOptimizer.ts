/**
 * Rules Optimizer Types
 * 
 * Types for parsing, analyzing, and optimizing Cursor rules and AGENTS.md files.
 */

/**
 * Supported rule file formats
 */
export type RuleFileFormat = 'mdc' | 'md' | 'txt' | 'cursorrules';

/**
 * A rule file in the filesystem
 */
export interface RuleFile {
  /** Absolute path to the file */
  path: string;
  /** File name without directory */
  filename: string;
  /** File format detected from extension */
  format: RuleFileFormat;
  /** Raw file content */
  content: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** Whether file is in .cursor/rules directory */
  isCursorRule: boolean;
}

/**
 * Metadata extracted from .mdc frontmatter
 */
export interface RuleFrontmatter {
  /** Rule description */
  description?: string;
  /** Glob patterns for file matching */
  globs?: string | string[];
  /** Whether rule is always applied */
  alwaysApply?: boolean;
  /** Rule priority/order */
  priority?: number;
  /** Custom tags */
  tags?: string[];
  /** Any additional frontmatter fields */
  [key: string]: unknown;
}

/**
 * A parsed rule extracted from a file
 */
export interface ParsedRule {
  /** Unique identifier for this rule */
  id: string;
  /** Rule title/name (from first heading or filename) */
  title: string;
  /** Rule content (markdown body) */
  content: string;
  /** Source file */
  sourceFile: RuleFile;
  /** Starting line in source file */
  startLine: number;
  /** Ending line in source file */
  endLine: number;
  /** Frontmatter metadata (for .mdc files) */
  frontmatter?: RuleFrontmatter;
  /** Extracted tags/categories */
  tags: string[];
  /** Dependencies on other rules (by ID or title) */
  dependencies: string[];
  /** Estimated token count */
  tokenCount: number;
  /** Content hash for deduplication */
  contentHash: string;
  /** Whether this is a section within a larger file */
  isSection: boolean;
  /** Parent rule ID if this is a section */
  parentRuleId?: string;
}

/**
 * Similarity match between two rules
 */
export interface DuplicateMatch {
  /** First rule */
  rule1: ParsedRule;
  /** Second rule */
  rule2: ParsedRule;
  /** Similarity score (0-1) */
  similarity: number;
  /** Type of match */
  matchType: DuplicateMatchType;
  /** Specific overlapping content/concepts */
  overlappingConcepts: string[];
  /** Recommendation for handling this duplicate */
  recommendation: DuplicateRecommendation;
}

export type DuplicateMatchType = 
  | 'exact'           // Identical content
  | 'near_exact'      // Minor formatting differences
  | 'semantic'        // Same meaning, different wording
  | 'subset'          // One rule is a subset of another
  | 'contradicting';  // Rules contradict each other

export type DuplicateRecommendation = 
  | 'merge'           // Merge into single rule
  | 'keep_newer'      // Keep the newer version
  | 'keep_specific'   // Keep the more specific one
  | 'manual_review'   // Requires human decision
  | 'resolve_conflict'; // Contradictions need resolution

/**
 * A cluster of related rules that could be merged
 */
export interface RuleCluster {
  /** Cluster identifier */
  id: string;
  /** Suggested name for merged rule */
  suggestedName: string;
  /** Rules in this cluster */
  rules: ParsedRule[];
  /** Common tags across all rules */
  commonTags: string[];
  /** Topic/theme of this cluster */
  topic: string;
  /** Confidence score for this grouping (0-1) */
  confidence: number;
  /** Total tokens if kept separate */
  totalTokensSeparate: number;
  /** Estimated tokens after merging */
  estimatedTokensMerged: number;
  /** Token savings percentage */
  savingsPercent: number;
}

/**
 * A candidate for rule merging
 */
export interface MergeCandidate {
  /** Rules to be merged */
  rules: ParsedRule[];
  /** Proposed merged content */
  mergedContent: string;
  /** Proposed merged title */
  mergedTitle: string;
  /** Reasoning for the merge */
  mergeRationale: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Token count before merge */
  tokensBefore: number;
  /** Token count after merge */
  tokensAfter: number;
  /** What was preserved from each rule */
  preservedFrom: Array<{
    ruleId: string;
    preservedConcepts: string[];
  }>;
}

/**
 * Conflict between rules
 */
export interface RuleConflict {
  /** First conflicting rule */
  rule1: ParsedRule;
  /** Second conflicting rule */
  rule2: ParsedRule;
  /** Type of conflict */
  conflictType: ConflictType;
  /** Description of the conflict */
  description: string;
  /** Specific conflicting statements */
  conflictingStatements: Array<{
    from: string;
    statement1: string;
    statement2: string;
  }>;
  /** Suggested resolution */
  resolution?: ConflictResolution;
}

export type ConflictType = 
  | 'direct_contradiction'    // Rules explicitly contradict
  | 'implicit_contradiction'  // Rules implicitly contradict
  | 'scope_overlap'           // Rules apply to same scope with different instructions
  | 'version_mismatch'        // Rules reference different versions
  | 'preference_conflict';    // Different preferred approaches

export interface ConflictResolution {
  /** Which rule to prefer */
  preferredRuleId: string;
  /** Why this rule is preferred */
  reasoning: string;
  /** Suggested merged content (if applicable) */
  mergedContent?: string;
}

/**
 * Overall optimization report
 */
export interface OptimizationReport {
  /** Report generation timestamp */
  generatedAt: Date;
  /** Directory/path that was analyzed */
  analyzedPath: string;
  
  /** Summary statistics */
  summary: {
    /** Total rule files found */
    totalFiles: number;
    /** Total individual rules extracted */
    totalRules: number;
    /** Total tokens before optimization */
    totalTokensBefore: number;
    /** Total tokens after optimization (if applied) */
    totalTokensAfter: number;
    /** Token savings percentage */
    savingsPercent: number;
    /** Number of duplicates found */
    duplicatesFound: number;
    /** Number of conflicts found */
    conflictsFound: number;
    /** Number of merge candidates */
    mergeCandidates: number;
    /** Number of outdated rules */
    outdatedRules: number;
  };
  
  /** Detailed findings */
  findings: {
    /** Duplicate matches */
    duplicates: DuplicateMatch[];
    /** Rule clusters */
    clusters: RuleCluster[];
    /** Merge candidates */
    merges: MergeCandidate[];
    /** Conflicts */
    conflicts: RuleConflict[];
    /** Rules detected as outdated */
    outdated: OutdatedRule[];
  };
  
  /** Optimization plan */
  plan: OptimizationPlan;
  
  /** Files that would be modified/created/deleted */
  fileChanges: FileChange[];
}

/**
 * A rule detected as potentially outdated
 */
export interface OutdatedRule {
  /** The outdated rule */
  rule: ParsedRule;
  /** Why it's considered outdated */
  reason: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Suggested action */
  action: 'remove' | 'update' | 'review';
  /** Specific outdated references */
  outdatedReferences: Array<{
    reference: string;
    currentVersion?: string;
    suggestedUpdate?: string;
  }>;
}

/**
 * Optimization plan with prioritized actions
 */
export interface OptimizationPlan {
  /** Ordered list of actions to take */
  actions: OptimizationAction[];
  /** Total estimated time to apply */
  estimatedDuration: string;
  /** Risk level of the plan */
  riskLevel: 'low' | 'medium' | 'high';
  /** Whether plan requires manual review */
  requiresManualReview: boolean;
}

export interface OptimizationAction {
  /** Action type */
  type: 'merge' | 'delete' | 'update' | 'create' | 'move' | 'review';
  /** Human-readable description */
  description: string;
  /** Rules affected */
  affectedRules: string[];
  /** Files affected */
  affectedFiles: string[];
  /** Token impact (negative = savings) */
  tokenImpact: number;
  /** Priority (1 = highest) */
  priority: number;
  /** Whether this action is safe to auto-apply */
  autoApplyable: boolean;
}

/**
 * File change for applying optimization
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Type of change */
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  /** Original content (for modify) */
  originalContent?: string;
  /** New content (for create/modify) */
  newContent?: string;
  /** New path (for rename) */
  newPath?: string;
  /** Backup path if created */
  backupPath?: string;
}

/**
 * Options for the rules optimizer
 */
export interface RulesOptimizerOptions {
  /** Minimum similarity threshold for duplicate detection (0-1) */
  duplicateThreshold?: number;
  /** Aggressiveness level for merging */
  aggressiveness?: 'conservative' | 'balanced' | 'aggressive';
  /** Whether to create backups before modifying */
  createBackups?: boolean;
  /** Directory for backups */
  backupDir?: string;
  /** Whether to detect outdated patterns */
  detectOutdated?: boolean;
  /** Whether to detect conflicts */
  detectConflicts?: boolean;
  /** Maximum token count per merged rule */
  maxTokensPerRule?: number;
  /** File patterns to include */
  includePatterns?: string[];
  /** File patterns to exclude */
  excludePatterns?: string[];
  /** Whether to use LLM for semantic analysis */
  useLLM?: boolean;
  /** Dry run mode - don't make actual changes */
  dryRun?: boolean;
}

/**
 * Default optimizer options
 */
export const DEFAULT_OPTIMIZER_OPTIONS: Required<RulesOptimizerOptions> = {
  duplicateThreshold: 0.7,
  aggressiveness: 'balanced',
  createBackups: true,
  backupDir: '.cursor-rag/rules-backup',
  detectOutdated: true,
  detectConflicts: true,
  maxTokensPerRule: 2000,
  includePatterns: ['**/*.mdc', '**/*.md', '**/AGENTS.md', '**/.cursorrules'],
  excludePatterns: ['**/node_modules/**', '**/.git/**'],
  useLLM: true,
  dryRun: false,
};

/**
 * Result of applying optimization
 */
export interface OptimizationResult {
  /** Whether optimization was successful */
  success: boolean;
  /** Changes that were applied */
  appliedChanges: FileChange[];
  /** Changes that failed */
  failedChanges: Array<{
    change: FileChange;
    error: string;
  }>;
  /** Backup directory if backups were created */
  backupDir?: string;
  /** Final statistics */
  stats: {
    filesModified: number;
    filesCreated: number;
    filesDeleted: number;
    tokensSaved: number;
    rulesRemoved: number;
    rulesMerged: number;
  };
  /** Any warnings */
  warnings: string[];
  /** Duration of operation */
  durationMs: number;
}
