/**
 * Rules Analyzer Configuration
 * 
 * User-configurable settings for the rules optimizer.
 * Can be set via:
 * - Config file: ~/.cursor-rag/rules-config.json
 * - Dashboard UI
 * - CLI flags
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Custom version check pattern
 */
export const VersionCheckSchema = z.object({
  /** Technology name (e.g., "Laravel", "React") */
  name: z.string(),
  /** Regex pattern to match version mentions (should have one capture group for version) */
  pattern: z.string(),
  /** Current/expected version number */
  currentVersion: z.string(),
  /** Whether this check is enabled */
  enabled: z.boolean().default(true),
});

export type VersionCheck = z.infer<typeof VersionCheckSchema>;

/**
 * Custom deprecation pattern
 */
export const DeprecationPatternSchema = z.object({
  /** Pattern name/identifier */
  name: z.string(),
  /** Regex pattern to detect the deprecated usage */
  pattern: z.string(),
  /** Human-readable reason why this is deprecated */
  reason: z.string(),
  /** Suggested alternative */
  suggestion: z.string().optional(),
  /** Whether this check is enabled */
  enabled: z.boolean().default(true),
});

export type DeprecationPattern = z.infer<typeof DeprecationPatternSchema>;

/**
 * Custom tag extraction pattern
 */
export const TagPatternSchema = z.object({
  /** Tag that will be applied */
  tag: z.string(),
  /** Regex pattern to match content */
  pattern: z.string(),
  /** Whether this pattern is enabled */
  enabled: z.boolean().default(true),
});

export type TagPattern = z.infer<typeof TagPatternSchema>;

/**
 * LLM Provider type
 */
export const LLMProviderTypeSchema = z.enum([
  'openai',
  'anthropic', 
  'deepseek',
  'groq',
  'ollama',
  'openrouter',
]);

export type LLMProviderType = z.infer<typeof LLMProviderTypeSchema>;

/**
 * LLM configuration for rules analyzer
 */
export const LLMConfigSchema = z.object({
  /** Selected provider */
  provider: LLMProviderTypeSchema.optional(),
  /** API key (stored securely) */
  apiKey: z.string().optional(),
  /** Selected model */
  model: z.string().optional(),
  /** Base URL override (for Ollama or custom endpoints) */
  baseUrl: z.string().optional(),
}).default({});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * Full rules analyzer configuration
 */
export const RulesAnalyzerConfigSchema = z.object({
  /** Analysis settings */
  analysis: z.object({
    /** Minimum similarity threshold for duplicate detection (0-1) */
    duplicateThreshold: z.number().min(0).max(1).default(0.7),
    /** Maximum age in days before flagging as potentially outdated */
    maxAgeDays: z.number().min(1).default(365),
    /** Years back to consider as "old" when referenced */
    oldYearThreshold: z.number().min(1).default(2),
    /** Whether to detect conflicts */
    detectConflicts: z.boolean().default(true),
    /** Whether to detect outdated rules */
    detectOutdated: z.boolean().default(true),
    /** Whether to use LLM for enhanced analysis */
    useLLM: z.boolean().default(false),
  }).default({}),

  /** LLM provider configuration */
  llm: LLMConfigSchema.default({}),

  /** Custom version checks */
  versionChecks: z.array(VersionCheckSchema).default([]),

  /** Custom deprecation patterns */
  deprecationPatterns: z.array(DeprecationPatternSchema).default([]),

  /** Custom tag extraction patterns */
  tagPatterns: z.array(TagPatternSchema).default([]),

  /** File patterns */
  files: z.object({
    /** Patterns to include */
    include: z.array(z.string()).default(['**/*.mdc', '**/*.md', '**/AGENTS.md', '**/.cursorrules']),
    /** Patterns to exclude */
    exclude: z.array(z.string()).default(['**/node_modules/**', '**/.git/**', '**/dist/**']),
  }).default({}),

  /** Optimization settings */
  optimization: z.object({
    /** Aggressiveness level */
    aggressiveness: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
    /** Maximum tokens per merged rule */
    maxTokensPerRule: z.number().min(100).default(2000),
    /** Create backups before modifications */
    createBackups: z.boolean().default(true),
    /** Backup directory */
    backupDir: z.string().default('.cursor-rag/rules-backup'),
  }).default({}),
});

export type RulesAnalyzerConfig = z.infer<typeof RulesAnalyzerConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_RULES_CONFIG: RulesAnalyzerConfig = {
  analysis: {
    duplicateThreshold: 0.7,
    maxAgeDays: 365,
    oldYearThreshold: 2,
    detectConflicts: true,
    detectOutdated: true,
    useLLM: false,
  },
  llm: {},
  versionChecks: [],
  deprecationPatterns: [],
  tagPatterns: [],
  files: {
    include: ['**/*.mdc', '**/*.md', '**/AGENTS.md', '**/.cursorrules'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  },
  optimization: {
    aggressiveness: 'balanced',
    maxTokensPerRule: 2000,
    createBackups: true,
    backupDir: '.cursor-rag/rules-backup',
  },
};

/**
 * Available LLM providers with their requirements
 */
export const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', requiresKey: true, placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', requiresKey: true, placeholder: 'sk-ant-...' },
  { id: 'deepseek', name: 'DeepSeek', requiresKey: true, placeholder: 'sk-...' },
  { id: 'groq', name: 'Groq', requiresKey: true, placeholder: 'gsk_...' },
  { id: 'ollama', name: 'Ollama (Local)', requiresKey: false, placeholder: '' },
  { id: 'openrouter', name: 'OpenRouter', requiresKey: true, placeholder: 'sk-or-...' },
] as const;

/**
 * Example configuration with common patterns (shown in dashboard as templates)
 */
export const EXAMPLE_PATTERNS = {
  versionChecks: [
    {
      name: 'Laravel',
      pattern: '\\blaravel\\s+(\\d+)',
      currentVersion: '11',
      enabled: false,
    },
    {
      name: 'React',
      pattern: '\\breact\\s+(\\d+)',
      currentVersion: '19',
      enabled: false,
    },
    {
      name: 'Vue',
      pattern: '\\bvue\\s+(\\d+)',
      currentVersion: '3',
      enabled: false,
    },
    {
      name: 'Node.js',
      pattern: '\\bnode\\.?js?\\s+(\\d+)',
      currentVersion: '22',
      enabled: false,
    },
    {
      name: 'TypeScript',
      pattern: '\\btypescript\\s+(\\d+\\.?\\d*)',
      currentVersion: '5.7',
      enabled: false,
    },
    {
      name: 'PHP',
      pattern: '\\bphp\\s+(\\d+\\.?\\d*)',
      currentVersion: '8.3',
      enabled: false,
    },
  ],
  deprecationPatterns: [
    {
      name: 'var-usage',
      pattern: '\\bvar\\s+\\w+\\s*=',
      reason: 'var is generally discouraged in modern JavaScript',
      suggestion: 'Use const or let instead',
      enabled: false,
    },
    {
      name: 'react-class-components',
      pattern: '\\bclass\\s+\\w+\\s+extends\\s+(React\\.)?Component\\b',
      reason: 'Class components are less common in modern React',
      suggestion: 'Consider using functional components with hooks',
      enabled: false,
    },
  ],
  tagPatterns: [
    {
      tag: 'typescript',
      pattern: '\\b(typescript|\\.ts|\\.tsx)\\b',
      enabled: true,
    },
    {
      tag: 'react',
      pattern: '\\breact\\b',
      enabled: true,
    },
    {
      tag: 'testing',
      pattern: '\\b(test|jest|vitest|cypress|playwright)\\b',
      enabled: true,
    },
  ],
};

/**
 * Get config file path
 */
function getConfigPath(): string {
  return join(homedir(), '.cursor-rag', 'rules-config.json');
}

/**
 * Load rules analyzer configuration
 */
export function loadRulesConfig(): RulesAnalyzerConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_RULES_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    const validated = RulesAnalyzerConfigSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.warn(`Failed to load rules config from ${configPath}:`, error);
    return DEFAULT_RULES_CONFIG;
  }
}

/**
 * Save rules analyzer configuration
 */
export function saveRulesConfig(config: RulesAnalyzerConfig): void {
  const configPath = getConfigPath();
  const configDir = join(homedir(), '.cursor-rag');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Validate before saving
  const validated = RulesAnalyzerConfigSchema.parse(config);
  writeFileSync(configPath, JSON.stringify(validated, null, 2));
}

/**
 * Merge user config with defaults
 */
export function mergeRulesConfig(
  userConfig: Partial<RulesAnalyzerConfig>
): RulesAnalyzerConfig {
  return RulesAnalyzerConfigSchema.parse({
    ...DEFAULT_RULES_CONFIG,
    ...userConfig,
    analysis: {
      ...DEFAULT_RULES_CONFIG.analysis,
      ...userConfig.analysis,
    },
    files: {
      ...DEFAULT_RULES_CONFIG.files,
      ...userConfig.files,
    },
    optimization: {
      ...DEFAULT_RULES_CONFIG.optimization,
      ...userConfig.optimization,
    },
  });
}

/**
 * Validate a single pattern (for UI validation)
 */
export function validatePattern(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern, 'gi');
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid regex pattern' 
    };
  }
}

/**
 * Test a pattern against sample content
 */
export function testPattern(pattern: string, content: string): {
  matches: boolean;
  matchedText?: string;
  captureGroups?: string[];
} {
  try {
    const regex = new RegExp(pattern, 'gi');
    const match = regex.exec(content);
    
    if (match) {
      return {
        matches: true,
        matchedText: match[0],
        captureGroups: match.slice(1),
      };
    }
    
    return { matches: false };
  } catch {
    return { matches: false };
  }
}
