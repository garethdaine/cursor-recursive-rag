import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { RAGConfig } from '../types/index.js';

export interface OpenSkillsConfig {
  enabled: boolean;
  autoIngestSkills: boolean;
  skillPaths?: string[];
}

export interface Skill {
  name: string;
  description: string;
  location: 'project' | 'global' | 'universal';
  path: string;
  content?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  tags?: string[];
}

const DEFAULT_SKILL_PATHS = [
  './.agent/skills',
  join(homedir(), '.agent/skills'),
  './.claude/skills',
  join(homedir(), '.claude/skills'),
  './.cursor/skills',
  join(homedir(), '.cursor/skills'),
  join(homedir(), '.cursor/skills-cursor'),
  join(homedir(), '.codex/skills')
];

export class OpenSkillsClient {
  private config: OpenSkillsConfig;
  private skillCache: Map<string, Skill> = new Map();

  constructor(ragConfig: RAGConfig) {
    this.config = ragConfig.openSkills || {
      enabled: false,
      autoIngestSkills: false,
      skillPaths: DEFAULT_SKILL_PATHS
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if openskills CLI is available
   */
  isCliAvailable(): boolean {
    try {
      execSync('npx openskills --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover all installed skills from configured paths
   */
  discoverSkills(): Skill[] {
    const skills: Skill[] = [];
    const paths = this.config.skillPaths || DEFAULT_SKILL_PATHS;

    for (const basePath of paths) {
      const resolvedPath = basePath.startsWith('~') 
        ? join(homedir(), basePath.slice(1))
        : basePath;

      if (!existsSync(resolvedPath)) continue;

      try {
        const entries = readdirSync(resolvedPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          
          const skillDir = join(resolvedPath, entry.name);
          const skillFile = join(skillDir, 'SKILL.md');
          
          if (existsSync(skillFile)) {
            const content = readFileSync(skillFile, 'utf-8');
            const metadata = this.parseSkillMetadata(content);
            
            const skill: Skill = {
              name: metadata.name || entry.name,
              description: metadata.description || '',
              location: this.getSkillLocation(resolvedPath),
              path: skillDir,
              content
            };
            
            skills.push(skill);
            this.skillCache.set(skill.name, skill);
          }
        }
      } catch (error) {
        console.warn(`Failed to read skills from ${resolvedPath}:`, error);
      }
    }

    return skills;
  }

  private getSkillLocation(path: string): 'project' | 'global' | 'universal' {
    if (path.includes('.agent')) return 'universal';
    if (path.startsWith(homedir())) return 'global';
    return 'project';
  }

  private parseSkillMetadata(content: string): SkillMetadata {
    const metadata: SkillMetadata = { name: '', description: '' };
    
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      
      const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
      if (nameMatch) metadata.name = nameMatch[1].trim();
      
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) metadata.description = descMatch[1].trim();
      
      const tagsMatch = frontmatter.match(/^tags:\s*\[(.+)\]$/m);
      if (tagsMatch) {
        metadata.tags = tagsMatch[1].split(',').map(t => t.trim());
      }
    }

    return metadata;
  }

  /**
   * Read a specific skill (using openskills CLI or direct file read)
   */
  async readSkill(name: string): Promise<Skill | null> {
    // Check cache first
    if (this.skillCache.has(name)) {
      return this.skillCache.get(name)!;
    }

    // Try CLI if available
    if (this.isCliAvailable()) {
      try {
        const output = execSync(`npx openskills read ${name}`, { 
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        
        // Parse the skill from CLI output
        const skill: Skill = {
          name,
          description: '',
          location: 'project',
          path: '',
          content: output
        };
        
        this.skillCache.set(name, skill);
        return skill;
      } catch {
        // Fall through to manual discovery
      }
    }

    // Manual discovery
    this.discoverSkills();
    return this.skillCache.get(name) || null;
  }

  /**
   * List all available skills (using CLI or discovery)
   */
  async listSkills(): Promise<Skill[]> {
    if (this.isCliAvailable()) {
      try {
        const output = execSync('npx openskills list --json', { 
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore']
        });
        
        const skills = JSON.parse(output);
        return skills;
      } catch {
        // Fall through to manual discovery
      }
    }

    return this.discoverSkills();
  }

  /**
   * Install skills from a source (GitHub repo, local path)
   */
  async installSkills(source: string, options?: { 
    global?: boolean; 
    universal?: boolean 
  }): Promise<boolean> {
    if (!this.isCliAvailable()) {
      console.warn('OpenSkills CLI not available. Install with: npm i -g openskills');
      return false;
    }

    const args = ['openskills', 'install', source];
    if (options?.global) args.push('--global');
    if (options?.universal) args.push('--universal');

    try {
      execSync(`npx ${args.join(' ')}`, { stdio: 'inherit' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get skill content for RAG ingestion
   * Returns the full SKILL.md content plus any referenced resources
   */
  getSkillContent(skill: Skill): string {
    let content = skill.content || '';

    // Check for referenced resources
    const resourcesDir = join(skill.path, 'references');
    if (existsSync(resourcesDir)) {
      try {
        const resources = readdirSync(resourcesDir);
        for (const resource of resources) {
          if (resource.endsWith('.md') || resource.endsWith('.txt')) {
            const resourcePath = join(resourcesDir, resource);
            const resourceContent = readFileSync(resourcePath, 'utf-8');
            content += `\n\n--- Resource: ${resource} ---\n${resourceContent}`;
          }
        }
      } catch {
        // Ignore resource read errors
      }
    }

    return content;
  }

  /**
   * Convert skills to documents for RAG ingestion
   */
  skillsToDocuments(): Array<{
    content: string;
    metadata: { source: string; type: string; name: string };
  }> {
    const skills = this.discoverSkills();
    
    return skills.map(skill => ({
      content: this.getSkillContent(skill),
      metadata: {
        source: `skill:${skill.name}`,
        type: 'skill',
        name: skill.name
      }
    }));
  }
}

export function createOpenSkillsClient(config: RAGConfig): OpenSkillsClient {
  return new OpenSkillsClient(config);
}
