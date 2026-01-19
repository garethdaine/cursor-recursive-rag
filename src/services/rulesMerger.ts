/**
 * Rules Merger Service
 * 
 * Uses LLM to intelligently merge and consolidate related rules.
 * Preserves critical details while reducing token count.
 */

import { getLLMProvider, type LLMProvider } from '../adapters/llm/index.js';
import type {
  ParsedRule,
  MergeCandidate,
  DuplicateMatch,
  RuleCluster,
  RuleFrontmatter,
} from '../types/rulesOptimizer.js';
import { loadRulesConfig, type RulesAnalyzerConfig } from '../config/rulesConfig.js';

export type MergeAggressiveness = 'conservative' | 'balanced' | 'aggressive';

export interface MergerOptions {
  aggressiveness: MergeAggressiveness;
  maxTokensPerRule: number;
  preserveFrontmatter: boolean;
  dryRun: boolean;
}

const DEFAULT_MERGER_OPTIONS: MergerOptions = {
  aggressiveness: 'balanced',
  maxTokensPerRule: 2000,
  preserveFrontmatter: true,
  dryRun: false,
};

interface MergeResult {
  success: boolean;
  mergedContent: string;
  mergedTitle: string;
  mergedFrontmatter?: RuleFrontmatter;
  rationale: string;
  preservedConcepts: Array<{ ruleId: string; concepts: string[] }>;
  tokensBefore: number;
  tokensAfter: number;
  error?: string;
}

/**
 * Rules Merger - uses LLM to intelligently merge rules
 */
export class RulesMerger {
  private llm: LLMProvider;
  private options: MergerOptions;
  private rulesConfig: RulesAnalyzerConfig;

  constructor(options?: Partial<MergerOptions>) {
    this.llm = getLLMProvider();
    this.options = { ...DEFAULT_MERGER_OPTIONS, ...options };
    this.rulesConfig = loadRulesConfig();
  }

  /**
   * Merge a pair of duplicate rules
   */
  async mergeDuplicates(match: DuplicateMatch): Promise<MergeCandidate> {
    const { rule1, rule2 } = match;
    
    const result = await this.mergeRules([rule1, rule2], {
      context: `These rules were detected as ${match.matchType} duplicates with ${Math.round(match.similarity * 100)}% similarity.`,
      overlappingConcepts: match.overlappingConcepts,
    });

    return {
      rules: [rule1, rule2],
      mergedContent: result.mergedContent,
      mergedTitle: result.mergedTitle,
      mergeRationale: result.rationale,
      confidence: match.similarity,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      preservedFrom: result.preservedConcepts.map(p => ({
        ruleId: p.ruleId,
        preservedConcepts: p.concepts,
      })),
    };
  }

  /**
   * Merge a cluster of related rules
   */
  async mergeCluster(cluster: RuleCluster): Promise<MergeCandidate> {
    const result = await this.mergeRules(cluster.rules, {
      context: `These ${cluster.rules.length} rules are related by topic: "${cluster.topic}". Common tags: ${cluster.commonTags.join(', ')}.`,
      suggestedName: cluster.suggestedName,
    });

    return {
      rules: cluster.rules,
      mergedContent: result.mergedContent,
      mergedTitle: result.mergedTitle,
      mergeRationale: result.rationale,
      confidence: cluster.confidence,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      preservedFrom: result.preservedConcepts.map(p => ({
        ruleId: p.ruleId,
        preservedConcepts: p.concepts,
      })),
    };
  }

  /**
   * Merge multiple rules into one
   */
  async mergeRules(
    rules: ParsedRule[],
    context?: {
      context?: string;
      overlappingConcepts?: string[];
      suggestedName?: string;
    }
  ): Promise<MergeResult> {
    if (rules.length === 0) {
      return {
        success: false,
        mergedContent: '',
        mergedTitle: '',
        rationale: 'No rules to merge',
        preservedConcepts: [],
        tokensBefore: 0,
        tokensAfter: 0,
        error: 'No rules provided',
      };
    }

    if (rules.length === 1) {
      return {
        success: true,
        mergedContent: rules[0].content,
        mergedTitle: rules[0].title,
        mergedFrontmatter: rules[0].frontmatter,
        rationale: 'Single rule, no merge needed',
        preservedConcepts: [{ ruleId: rules[0].id, concepts: ['all'] }],
        tokensBefore: rules[0].tokenCount,
        tokensAfter: rules[0].tokenCount,
      };
    }

    const tokensBefore = rules.reduce((sum, r) => sum + r.tokenCount, 0);
    
    const prompt = this.buildMergePrompt(rules, context);

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0.3,
        maxTokens: Math.min(this.options.maxTokensPerRule * 2, 4000),
        jsonMode: true,
      });

      const parsed = this.parseResponse(response.content);
      
      if (!parsed.success) {
        return {
          success: false,
          mergedContent: '',
          mergedTitle: '',
          rationale: 'Failed to parse LLM response',
          preservedConcepts: [],
          tokensBefore,
          tokensAfter: tokensBefore,
          error: parsed.error,
        };
      }

      const tokensAfter = this.estimateTokens(parsed.mergedContent);

      return {
        success: true,
        mergedContent: parsed.mergedContent,
        mergedTitle: parsed.mergedTitle,
        mergedFrontmatter: this.mergeFrontmatter(rules),
        rationale: parsed.rationale,
        preservedConcepts: parsed.preservedConcepts,
        tokensBefore,
        tokensAfter,
      };
    } catch (error) {
      return {
        success: false,
        mergedContent: '',
        mergedTitle: '',
        rationale: 'LLM request failed',
        preservedConcepts: [],
        tokensBefore,
        tokensAfter: tokensBefore,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rewrite a single rule to be more concise
   */
  async rewriteRule(rule: ParsedRule): Promise<MergeResult> {
    const prompt = `Rewrite this rule to be more concise while preserving all important information.

**Rule: ${rule.title}**
\`\`\`
${rule.content}
\`\`\`

Target: Reduce token count by at least 20% while keeping all critical instructions.

Respond in JSON format:
{
  "mergedTitle": "improved title",
  "mergedContent": "the rewritten rule content",
  "rationale": "explanation of what was condensed",
  "preservedConcepts": [{"ruleId": "${rule.id}", "concepts": ["list", "of", "key", "concepts"]}]
}`;

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0.3,
        maxTokens: Math.min(this.options.maxTokensPerRule * 2, 4000),
        jsonMode: true,
      });

      const parsed = this.parseResponse(response.content);
      
      if (!parsed.success) {
        return {
          success: false,
          mergedContent: rule.content,
          mergedTitle: rule.title,
          rationale: 'Failed to rewrite',
          preservedConcepts: [],
          tokensBefore: rule.tokenCount,
          tokensAfter: rule.tokenCount,
          error: parsed.error,
        };
      }

      const tokensAfter = this.estimateTokens(parsed.mergedContent);

      return {
        success: true,
        mergedContent: parsed.mergedContent,
        mergedTitle: parsed.mergedTitle,
        mergedFrontmatter: rule.frontmatter,
        rationale: parsed.rationale,
        preservedConcepts: parsed.preservedConcepts,
        tokensBefore: rule.tokenCount,
        tokensAfter,
      };
    } catch (error) {
      return {
        success: false,
        mergedContent: rule.content,
        mergedTitle: rule.title,
        rationale: 'LLM request failed',
        preservedConcepts: [],
        tokensBefore: rule.tokenCount,
        tokensAfter: rule.tokenCount,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch merge multiple pairs/clusters
   */
  async batchMerge(
    items: Array<{ type: 'duplicate'; match: DuplicateMatch } | { type: 'cluster'; cluster: RuleCluster }>
  ): Promise<MergeCandidate[]> {
    const results: MergeCandidate[] = [];

    for (const item of items) {
      if (item.type === 'duplicate') {
        const candidate = await this.mergeDuplicates(item.match);
        results.push(candidate);
      } else {
        const candidate = await this.mergeCluster(item.cluster);
        results.push(candidate);
      }
    }

    return results;
  }

  private getSystemPrompt(): string {
    const aggressivenessGuide = {
      conservative: 'Preserve as much detail as possible. Only remove clearly redundant content.',
      balanced: 'Balance conciseness with completeness. Remove redundancy but keep all unique concepts.',
      aggressive: 'Maximize conciseness. Keep only essential instructions and examples.',
    };

    return `You are an expert at merging and consolidating coding rules/guidelines.

Your task is to merge multiple rules into a single, well-organized rule that:
1. Preserves ALL unique and important information from each source rule
2. Eliminates redundancy and repetition
3. Maintains clear, actionable instructions
4. Uses consistent formatting and structure
5. Is ${this.options.aggressiveness}: ${aggressivenessGuide[this.options.aggressiveness]}

Output format: Always respond with valid JSON matching the requested schema.
Do NOT include markdown code fences around the JSON.`;
  }

  private buildMergePrompt(
    rules: ParsedRule[],
    context?: {
      context?: string;
      overlappingConcepts?: string[];
      suggestedName?: string;
    }
  ): string {
    let prompt = 'Merge the following rules into a single comprehensive rule.\n\n';

    if (context?.context) {
      prompt += `**Context:** ${context.context}\n\n`;
    }

    if (context?.overlappingConcepts?.length) {
      prompt += `**Overlapping concepts:** ${context.overlappingConcepts.join(', ')}\n\n`;
    }

    prompt += '**Rules to merge:**\n\n';

    for (const rule of rules) {
      prompt += `---\n**Rule ${rules.indexOf(rule) + 1}: ${rule.title}** (${rule.tokenCount} tokens)\n`;
      if (rule.tags.length > 0) {
        prompt += `Tags: ${rule.tags.join(', ')}\n`;
      }
      prompt += `\n${rule.content}\n\n`;
    }

    prompt += `---\n\n`;
    prompt += `**Requirements:**\n`;
    prompt += `- Maximum ${this.options.maxTokensPerRule} tokens for merged rule\n`;
    prompt += `- Preserve all unique instructions and examples\n`;
    prompt += `- Use clear headings and bullet points\n`;
    prompt += `- Aggressiveness: ${this.options.aggressiveness}\n\n`;

    if (context?.suggestedName) {
      prompt += `Suggested title: "${context.suggestedName}"\n\n`;
    }

    prompt += `Respond in JSON format:
{
  "mergedTitle": "title for the merged rule",
  "mergedContent": "the complete merged rule content in markdown",
  "rationale": "brief explanation of how rules were combined",
  "preservedConcepts": [
    {"ruleId": "rule-id-1", "concepts": ["concept1", "concept2"]},
    {"ruleId": "rule-id-2", "concepts": ["concept3", "concept4"]}
  ]
}`;

    return prompt;
  }

  private parseResponse(content: string): {
    success: boolean;
    mergedTitle: string;
    mergedContent: string;
    rationale: string;
    preservedConcepts: Array<{ ruleId: string; concepts: string[] }>;
    error?: string;
  } {
    try {
      // Clean up potential markdown code fences
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      return {
        success: true,
        mergedTitle: parsed.mergedTitle || 'Merged Rule',
        mergedContent: parsed.mergedContent || '',
        rationale: parsed.rationale || 'No rationale provided',
        preservedConcepts: parsed.preservedConcepts || [],
      };
    } catch (error) {
      return {
        success: false,
        mergedTitle: '',
        mergedContent: '',
        rationale: '',
        preservedConcepts: [],
        error: `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private mergeFrontmatter(rules: ParsedRule[]): RuleFrontmatter | undefined {
    if (!this.options.preserveFrontmatter) {
      return undefined;
    }

    const frontmatters = rules
      .map(r => r.frontmatter)
      .filter((f): f is RuleFrontmatter => f !== undefined);

    if (frontmatters.length === 0) {
      return undefined;
    }

    // Merge frontmatter fields
    const merged: RuleFrontmatter = {};

    // Collect all tags
    const allTags = new Set<string>();
    for (const fm of frontmatters) {
      if (fm.tags) {
        for (const tag of fm.tags) {
          allTags.add(tag);
        }
      }
    }
    if (allTags.size > 0) {
      merged.tags = Array.from(allTags);
    }

    // Collect all globs
    const allGlobs = new Set<string>();
    for (const fm of frontmatters) {
      if (fm.globs) {
        const globs = Array.isArray(fm.globs) ? fm.globs : [fm.globs];
        for (const glob of globs) {
          allGlobs.add(glob);
        }
      }
    }
    if (allGlobs.size > 0) {
      merged.globs = Array.from(allGlobs);
    }

    // Use highest priority
    const priorities = frontmatters
      .map(fm => fm.priority)
      .filter((p): p is number => p !== undefined);
    if (priorities.length > 0) {
      merged.priority = Math.max(...priorities);
    }

    // If any rule is always-apply, merged rule is too
    merged.alwaysApply = frontmatters.some(fm => fm.alwaysApply);

    // Combine descriptions
    const descriptions = frontmatters
      .map(fm => fm.description)
      .filter((d): d is string => d !== undefined);
    if (descriptions.length > 0) {
      merged.description = descriptions.join(' | ');
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }
}

/**
 * Singleton instance
 */
let mergerInstance: RulesMerger | null = null;

export function getRulesMerger(options?: Partial<MergerOptions>): RulesMerger {
  if (!mergerInstance || options) {
    mergerInstance = new RulesMerger(options);
  }
  return mergerInstance;
}
