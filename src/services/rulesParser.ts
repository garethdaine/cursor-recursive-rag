/**
 * Rules Parser Service
 * 
 * Parses various rule file formats (.mdc, .md, AGENTS.md, .cursorrules)
 * into structured representations for analysis and optimization.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname, relative, dirname } from 'path';
import { createHash } from 'crypto';
import { get_encoding } from 'tiktoken';

import type {
  RuleFile,
  RuleFileFormat,
  ParsedRule,
  RuleFrontmatter,
} from '../types/rulesOptimizer.js';

const encoder = get_encoding('cl100k_base');

/**
 * Parser for rule files
 */
export class RulesParser {
  private includePatterns: string[];
  private excludePatterns: string[];

  constructor(options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
  }) {
    this.includePatterns = options?.includePatterns ?? [
      '**/*.mdc',
      '**/*.md',
      '**/AGENTS.md',
      '**/.cursorrules',
    ];
    this.excludePatterns = options?.excludePatterns ?? [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
    ];
  }

  /**
   * Scan a directory for rule files
   */
  scanDirectory(dirPath: string): RuleFile[] {
    const files: RuleFile[] = [];
    
    if (!existsSync(dirPath)) {
      return files;
    }

    const scan = (currentPath: string) => {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relativePath = relative(dirPath, fullPath);

        if (this.shouldExclude(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && this.shouldInclude(relativePath, entry.name)) {
          const ruleFile = this.readRuleFile(fullPath);
          if (ruleFile) {
            files.push(ruleFile);
          }
        }
      }
    };

    scan(dirPath);
    return files;
  }

  /**
   * Read a single rule file
   */
  readRuleFile(filePath: string): RuleFile | null {
    try {
      const stats = statSync(filePath);
      const content = readFileSync(filePath, 'utf-8');
      const filename = basename(filePath);
      const format = this.detectFormat(filename);

      return {
        path: filePath,
        filename,
        format,
        content,
        size: stats.size,
        lastModified: stats.mtime,
        isCursorRule: filePath.includes('.cursor/rules') || filename === '.cursorrules',
      };
    } catch (error) {
      console.warn(`Failed to read rule file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Parse rules from a file
   */
  parseFile(file: RuleFile): ParsedRule[] {
    switch (file.format) {
      case 'mdc':
        return this.parseMdcFile(file);
      case 'md':
        return this.parseMarkdownFile(file);
      case 'cursorrules':
        return this.parseCursorRulesFile(file);
      case 'txt':
        return this.parsePlainTextFile(file);
      default:
        return [];
    }
  }

  /**
   * Parse all rules from a directory
   */
  parseDirectory(dirPath: string): ParsedRule[] {
    const files = this.scanDirectory(dirPath);
    const rules: ParsedRule[] = [];

    for (const file of files) {
      const parsedRules = this.parseFile(file);
      rules.push(...parsedRules);
    }

    return rules;
  }

  /**
   * Parse .mdc file (Cursor rules format with YAML frontmatter)
   */
  private parseMdcFile(file: RuleFile): ParsedRule[] {
    const { frontmatter, content, frontmatterEndLine } = this.extractFrontmatter(file.content);
    
    // For .mdc files, typically one rule per file
    const title = this.extractTitle(content, file.filename.replace('.mdc', ''));
    const tags = this.extractTags(content, frontmatter);
    const dependencies = this.extractDependencies(content);
    const tokenCount = this.countTokens(content);
    const contentHash = this.hashContent(content);

    return [{
      id: this.generateId(file.path),
      title,
      content,
      sourceFile: file,
      startLine: frontmatterEndLine + 1,
      endLine: file.content.split('\n').length,
      frontmatter,
      tags,
      dependencies,
      tokenCount,
      contentHash,
      isSection: false,
    }];
  }

  /**
   * Parse markdown file (including AGENTS.md)
   */
  private parseMarkdownFile(file: RuleFile): ParsedRule[] {
    const rules: ParsedRule[] = [];
    const lines = file.content.split('\n');
    
    // Check for YAML frontmatter at the start
    const { frontmatter, content, frontmatterEndLine } = this.extractFrontmatter(file.content);

    // Special handling for AGENTS.md - parse as single rule or by sections
    if (file.filename === 'AGENTS.md' || file.filename.toUpperCase() === 'AGENTS.MD') {
      const sections = this.extractSections(content, frontmatterEndLine);
      
      if (sections.length <= 1) {
        // Single rule
        const title = this.extractTitle(content, 'AGENTS');
        rules.push({
          id: this.generateId(file.path),
          title,
          content,
          sourceFile: file,
          startLine: frontmatterEndLine + 1,
          endLine: lines.length,
          frontmatter,
          tags: this.extractTags(content, frontmatter),
          dependencies: this.extractDependencies(content),
          tokenCount: this.countTokens(content),
          contentHash: this.hashContent(content),
          isSection: false,
        });
      } else {
        // Multiple sections
        const parentId = this.generateId(file.path);
        for (const section of sections) {
          rules.push({
            id: `${parentId}:${this.slugify(section.title)}`,
            title: section.title,
            content: section.content,
            sourceFile: file,
            startLine: section.startLine + frontmatterEndLine,
            endLine: section.endLine + frontmatterEndLine,
            frontmatter,
            tags: this.extractTags(section.content, frontmatter),
            dependencies: this.extractDependencies(section.content),
            tokenCount: this.countTokens(section.content),
            contentHash: this.hashContent(section.content),
            isSection: true,
            parentRuleId: parentId,
          });
        }
      }
    } else {
      // Regular markdown file - parse as single rule
      const title = this.extractTitle(content, file.filename.replace('.md', ''));
      rules.push({
        id: this.generateId(file.path),
        title,
        content,
        sourceFile: file,
        startLine: frontmatterEndLine + 1,
        endLine: lines.length,
        frontmatter,
        tags: this.extractTags(content, frontmatter),
        dependencies: this.extractDependencies(content),
        tokenCount: this.countTokens(content),
        contentHash: this.hashContent(content),
        isSection: false,
      });
    }

    return rules;
  }

  /**
   * Parse .cursorrules file (legacy plain text format)
   */
  private parseCursorRulesFile(file: RuleFile): ParsedRule[] {
    const content = file.content.trim();
    const title = 'Project Rules';
    const tags = this.extractTags(content, undefined);
    
    return [{
      id: this.generateId(file.path),
      title,
      content,
      sourceFile: file,
      startLine: 1,
      endLine: content.split('\n').length,
      tags,
      dependencies: this.extractDependencies(content),
      tokenCount: this.countTokens(content),
      contentHash: this.hashContent(content),
      isSection: false,
    }];
  }

  /**
   * Parse plain text file
   */
  private parsePlainTextFile(file: RuleFile): ParsedRule[] {
    const content = file.content.trim();
    const title = file.filename.replace('.txt', '');
    
    return [{
      id: this.generateId(file.path),
      title,
      content,
      sourceFile: file,
      startLine: 1,
      endLine: content.split('\n').length,
      tags: this.extractTags(content, undefined),
      dependencies: [],
      tokenCount: this.countTokens(content),
      contentHash: this.hashContent(content),
      isSection: false,
    }];
  }

  /**
   * Extract YAML frontmatter from content
   */
  private extractFrontmatter(content: string): {
    frontmatter: RuleFrontmatter | undefined;
    content: string;
    frontmatterEndLine: number;
  } {
    const lines = content.split('\n');
    
    if (lines[0]?.trim() !== '---') {
      return { frontmatter: undefined, content, frontmatterEndLine: 0 };
    }

    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === '---') {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) {
      return { frontmatter: undefined, content, frontmatterEndLine: 0 };
    }

    const frontmatterContent = lines.slice(1, endIndex).join('\n');
    const bodyContent = lines.slice(endIndex + 1).join('\n').trim();

    try {
      const frontmatter = this.parseYamlFrontmatter(frontmatterContent);
      return {
        frontmatter,
        content: bodyContent,
        frontmatterEndLine: endIndex + 1,
      };
    } catch {
      return { frontmatter: undefined, content, frontmatterEndLine: 0 };
    }
  }

  /**
   * Simple YAML frontmatter parser (no external dependency)
   */
  private parseYamlFrontmatter(yaml: string): RuleFrontmatter {
    const result: RuleFrontmatter = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        
        if (!key) continue;
        
        // Handle arrays
        if (value?.startsWith('[') && value?.endsWith(']')) {
          result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        }
        // Handle booleans
        else if (value === 'true' || value === 'false') {
          result[key] = value === 'true';
        }
        // Handle numbers
        else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        }
        // Handle quoted strings
        else if (value?.startsWith('"') || value?.startsWith("'")) {
          result[key] = value.slice(1, -1);
        }
        // Plain string
        else {
          result[key] = value ?? '';
        }
      }
    }

    return result;
  }

  /**
   * Extract sections from markdown content
   */
  private extractSections(content: string, offset: number = 0): Array<{
    title: string;
    content: string;
    startLine: number;
    endLine: number;
  }> {
    const sections: Array<{
      title: string;
      content: string;
      startLine: number;
      endLine: number;
    }> = [];

    const lines = content.split('\n');
    let currentSection: { title: string; startLine: number; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const headerMatch = line.match(/^(#{1,2})\s+(.+)$/);

      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.lines.join('\n').trim(),
            startLine: currentSection.startLine,
            endLine: i,
          });
        }

        // Start new section
        currentSection = {
          title: headerMatch[2]?.trim() ?? '',
          startLine: i + 1,
          lines: [],
        };
      } else if (currentSection) {
        currentSection.lines.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.lines.join('\n').trim(),
        startLine: currentSection.startLine,
        endLine: lines.length,
      });
    }

    return sections;
  }

  /**
   * Extract title from content
   */
  private extractTitle(content: string, fallback: string): string {
    // Try to find a # heading
    const headerMatch = content.match(/^#\s+(.+)$/m);
    if (headerMatch?.[1]) {
      return headerMatch[1].trim();
    }

    // Try to find first non-empty line
    const firstLine = content.split('\n').find(l => l.trim().length > 0);
    if (firstLine && firstLine.length < 100) {
      return firstLine.trim();
    }

    return fallback;
  }

  /**
   * Extract tags from content and frontmatter
   */
  private extractTags(content: string, frontmatter?: RuleFrontmatter): string[] {
    const tags = new Set<string>();

    // Tags from frontmatter
    if (frontmatter?.tags) {
      const fmTags = Array.isArray(frontmatter.tags) 
        ? frontmatter.tags 
        : [frontmatter.tags];
      fmTags.forEach(t => tags.add(t));
    }

    // Technology detection patterns
    const techPatterns: Record<string, RegExp> = {
      typescript: /\b(typescript|\.ts|\.tsx)\b/i,
      javascript: /\b(javascript|\.js|\.jsx)\b/i,
      react: /\breact\b/i,
      vue: /\bvue\b/i,
      angular: /\bangular\b/i,
      svelte: /\bsvelte\b/i,
      node: /\bnode\.?js\b/i,
      python: /\bpython\b/i,
      rust: /\brust\b/i,
      go: /\bgolang|\bgo\b/i,
      php: /\bphp\b/i,
      laravel: /\blaravel\b/i,
      nextjs: /\bnext\.?js\b/i,
      nuxt: /\bnuxt\b/i,
      tailwind: /\btailwind\b/i,
      css: /\bcss\b/i,
      html: /\bhtml\b/i,
      api: /\bapi\b/i,
      database: /\b(database|sql|postgres|mysql|mongo|redis)\b/i,
      testing: /\b(test|jest|vitest|cypress|playwright)\b/i,
      git: /\bgit\b/i,
      docker: /\bdocker\b/i,
      aws: /\baws\b/i,
      cloudflare: /\bcloudflare\b/i,
      security: /\b(security|auth|authentication)\b/i,
      performance: /\b(performance|optimization)\b/i,
    };

    for (const [tag, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(content)) {
        tags.add(tag);
      }
    }

    return Array.from(tags);
  }

  /**
   * Extract dependencies from content
   */
  private extractDependencies(content: string): string[] {
    const deps: string[] = [];

    // Look for explicit references to other rules
    const refPatterns = [
      /see\s+(?:the\s+)?["']([^"']+)["']\s+rule/gi,
      /refer\s+to\s+["']([^"']+)["']/gi,
      /@include\s+["']([^"']+)["']/gi,
      /depends\s+on\s+["']([^"']+)["']/gi,
    ];

    for (const pattern of refPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          deps.push(match[1]);
        }
      }
    }

    return [...new Set(deps)];
  }

  /**
   * Count tokens in content
   */
  private countTokens(content: string): number {
    try {
      const tokens = encoder.encode(content);
      return tokens.length;
    } catch {
      // Fallback: rough estimate (4 chars per token)
      return Math.ceil(content.length / 4);
    }
  }

  /**
   * Create content hash for deduplication
   */
  private hashContent(content: string): string {
    // Normalize content before hashing
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    
    return createHash('md5').update(normalized).digest('hex').substring(0, 16);
  }

  /**
   * Generate unique ID for a rule
   */
  private generateId(filePath: string, suffix?: string): string {
    const hash = createHash('md5')
      .update(filePath + (suffix ?? ''))
      .digest('hex')
      .substring(0, 8);
    
    return `rule-${hash}`;
  }

  /**
   * Create URL-safe slug from title
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  /**
   * Detect file format from filename
   */
  private detectFormat(filename: string): RuleFileFormat {
    const ext = extname(filename).toLowerCase();
    
    if (ext === '.mdc') return 'mdc';
    if (ext === '.md') return 'md';
    if (ext === '.txt') return 'txt';
    if (filename === '.cursorrules') return 'cursorrules';
    
    return 'txt';
  }

  /**
   * Check if path should be excluded
   */
  private shouldExclude(relativePath: string): boolean {
    for (const pattern of this.excludePatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if path should be included
   */
  private shouldInclude(relativePath: string, filename: string): boolean {
    // Special files always included
    if (filename === '.cursorrules' || filename === 'AGENTS.md') {
      return true;
    }

    // Check file extension directly
    const ext = extname(filename).toLowerCase();
    if (ext === '.mdc' || ext === '.md') {
      return true;
    }

    for (const pattern of this.includePatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob matching (supports ** and *)
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '<<DOUBLESTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<DOUBLESTAR>>/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path) || regex.test(basename(path));
  }
}

/**
 * Singleton instance
 */
let parserInstance: RulesParser | null = null;

export function getRulesParser(options?: {
  includePatterns?: string[];
  excludePatterns?: string[];
}): RulesParser {
  if (!parserInstance || options) {
    parserInstance = new RulesParser(options);
  }
  return parserInstance;
}

/**
 * Convenience function to parse a directory
 */
export function parseRulesDirectory(dirPath: string, options?: {
  includePatterns?: string[];
  excludePatterns?: string[];
}): ParsedRule[] {
  const parser = new RulesParser(options);
  return parser.parseDirectory(dirPath);
}

/**
 * Convenience function to parse a single file
 */
export function parseRuleFile(filePath: string): ParsedRule[] {
  const parser = new RulesParser();
  const file = parser.readRuleFile(filePath);
  if (!file) return [];
  return parser.parseFile(file);
}
