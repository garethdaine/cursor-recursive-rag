import { randomUUID } from 'crypto';

/**
 * Tool parameter type definitions
 */
export type ToolParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Defines a single parameter for a tool
 */
export interface ToolParameter {
  name: string;
  type: ToolParameterType;
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
  items?: { type: ToolParameterType };
  properties?: Record<string, ToolParameter>;
}

/**
 * JSON Schema representation for a parameter (used for form generation)
 */
export interface JSONSchemaProperty {
  type: string;
  description?: string;
  default?: any;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * JSON Schema for tool parameters
 */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
}

/**
 * Categories for organizing tools in the UI
 */
export enum ToolCategory {
  SEARCH = 'search',
  INGEST = 'ingest',
  MAINTENANCE = 'maintenance',
  MEMORY = 'memory',
  CHAT = 'chat',
  UTILITY = 'utility',
}

/**
 * Definition of a tool that can be executed from the dashboard
 */
export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  isLongRunning?: boolean;
  estimatedDuration?: string;
}

/**
 * Result from executing a tool
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  executionTime?: number;
}

/**
 * Job status for long-running tools
 */
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Job information for tracking long-running tool executions
 */
export interface ToolJob {
  id: string;
  toolName: string;
  status: JobStatus;
  progress?: number;
  progressMessage?: string;
  result?: ToolResult;
  startedAt: Date;
  completedAt?: Date;
  parameters: Record<string, any>;
}

/**
 * Tool execution function type
 */
export type ToolExecutor = (
  params: Record<string, any>,
  onProgress?: (progress: number, message: string) => void
) => Promise<ToolResult>;

/**
 * Registry entry combining definition and executor
 */
interface ToolRegistryEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

/**
 * Tool Registry - manages tool registration, discovery, and execution
 */
export class ToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();
  private jobs: Map<string, ToolJob> = new Map();
  private static instance: ToolRegistry | null = null;

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool with the registry
   */
  register(definition: ToolDefinition, executor: ToolExecutor): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }
    this.tools.set(definition.name, { definition, executor });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(entry => entry.definition);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getTools().filter(tool => tool.category === category);
  }

  /**
   * Get a specific tool definition
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Generate JSON Schema for a tool's parameters (for form generation)
   */
  getParameterSchema(name: string): ToolParameterSchema | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;

    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];

    for (const param of tool.definition.parameters) {
      properties[param.name] = this.parameterToJsonSchema(param);
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * Convert a ToolParameter to JSON Schema property
   */
  private parameterToJsonSchema(param: ToolParameter): JSONSchemaProperty {
    const schema: JSONSchemaProperty = {
      type: param.type,
      description: param.description,
    };

    if (param.default !== undefined) {
      schema.default = param.default;
    }

    if (param.enum) {
      schema.enum = param.enum;
    }

    if (param.type === 'array' && param.items) {
      schema.items = { type: param.items.type };
    }

    if (param.type === 'object' && param.properties) {
      schema.properties = {};
      for (const [key, prop] of Object.entries(param.properties)) {
        schema.properties[key] = this.parameterToJsonSchema(prop);
      }
    }

    return schema;
  }

  /**
   * Validate parameters against a tool's schema
   */
  validateParameters(name: string, params: Record<string, any>): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool '${name}' not found`] };
    }

    const errors: string[] = [];

    for (const param of tool.definition.parameters) {
      const value = params[param.name];

      if (param.required && value === undefined) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined) {
        const typeValid = this.validateType(value, param.type);
        if (!typeValid) {
          errors.push(`Parameter '${param.name}' should be of type ${param.type}`);
        }

        if (param.enum && !param.enum.includes(value)) {
          errors.push(`Parameter '${param.name}' must be one of: ${param.enum.join(', ')}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a value's type
   */
  private validateType(value: any, type: ToolParameterType): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Execute a tool synchronously
   */
  async execute(name: string, params: Record<string, any>): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return { success: false, error: `Tool '${name}' not found` };
    }

    const validation = this.validateParameters(name, params);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
    }

    const paramsWithDefaults = this.applyDefaults(entry.definition, params);
    const startTime = Date.now();

    try {
      const result = await entry.executor(paramsWithDefaults);
      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a tool asynchronously as a job (for long-running tools)
   */
  executeAsync(
    name: string,
    params: Record<string, any>,
    onProgress?: (job: ToolJob) => void
  ): string {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Tool '${name}' not found`);
    }

    const jobId = randomUUID();
    const job: ToolJob = {
      id: jobId,
      toolName: name,
      status: JobStatus.PENDING,
      startedAt: new Date(),
      parameters: params,
    };

    this.jobs.set(jobId, job);

    const paramsWithDefaults = this.applyDefaults(entry.definition, params);

    setImmediate(async () => {
      job.status = JobStatus.RUNNING;
      onProgress?.(job);

      try {
        const result = await entry.executor(paramsWithDefaults, (progress, message) => {
          job.progress = progress;
          job.progressMessage = message;
          onProgress?.(job);
        });

        job.status = JobStatus.COMPLETED;
        job.result = result;
        job.completedAt = new Date();
      } catch (error) {
        job.status = JobStatus.FAILED;
        job.result = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        job.completedAt = new Date();
      }

      onProgress?.(job);
    });

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): ToolJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs for a tool
   */
  getJobsForTool(name: string): ToolJob[] {
    return Array.from(this.jobs.values()).filter(job => job.toolName === name);
  }

  /**
   * Get recent jobs
   */
  getRecentJobs(limit: number = 10): ToolJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Cancel a running job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== JobStatus.RUNNING) {
      return false;
    }
    job.status = JobStatus.CANCELLED;
    job.completedAt = new Date();
    return true;
  }

  /**
   * Clear old completed/failed jobs
   */
  cleanupJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let count = 0;

    for (const [id, job] of this.jobs) {
      if (
        job.completedAt &&
        job.completedAt.getTime() < cutoff &&
        (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)
      ) {
        this.jobs.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Apply default values to parameters
   */
  private applyDefaults(
    definition: ToolDefinition,
    params: Record<string, any>
  ): Record<string, any> {
    const result = { ...params };

    for (const param of definition.parameters) {
      if (result[param.name] === undefined && param.default !== undefined) {
        result[param.name] = param.default;
      }
    }

    return result;
  }

  /**
   * Get all categories with their tool counts
   */
  getCategoriesWithCounts(): Record<ToolCategory, number> {
    const counts: Record<ToolCategory, number> = {
      [ToolCategory.SEARCH]: 0,
      [ToolCategory.INGEST]: 0,
      [ToolCategory.MAINTENANCE]: 0,
      [ToolCategory.MEMORY]: 0,
      [ToolCategory.CHAT]: 0,
      [ToolCategory.UTILITY]: 0,
    };

    for (const entry of this.tools.values()) {
      counts[entry.definition.category]++;
    }

    return counts;
  }
}

export function getToolRegistry(): ToolRegistry {
  return ToolRegistry.getInstance();
}
