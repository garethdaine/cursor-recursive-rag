import type { RAGConfig } from '../types/index.js';

export interface MCPGatewayConfig {
  enabled: boolean;
  url: string;
  apiKey?: string;
}

export interface GatewayToolCall {
  toolName: string;
  args: Record<string, any>;
  filter?: {
    maxRows?: number;
    fields?: string[];
    format?: 'full' | 'summary' | 'count';
  };
}

export interface GatewaySearchResult {
  tools: Array<{
    name: string;
    description: string;
    backend: string;
  }>;
}

export class MCPGatewayClient {
  private config: MCPGatewayConfig;

  constructor(ragConfig: RAGConfig) {
    this.config = ragConfig.mcpGateway || {
      enabled: false,
      url: 'http://localhost:3010'
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.url}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`MCP Gateway error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search available tools in the gateway
   */
  async searchTools(query: string, options?: { 
    backend?: string; 
    detailLevel?: 'name_only' | 'name_description' | 'full_schema' 
  }): Promise<GatewaySearchResult> {
    const params = new URLSearchParams({ query });
    if (options?.backend) params.set('backend', options.backend);
    if (options?.detailLevel) params.set('detailLevel', options.detailLevel);

    return this.request(`/api/code/tools/search?${params}`);
  }

  /**
   * Get tool schema (lazy loading)
   */
  async getToolSchema(toolName: string, compact = true): Promise<any> {
    const params = new URLSearchParams();
    if (compact) params.set('compact', 'true');
    
    return this.request(`/api/code/tools/${toolName}/schema?${params}`);
  }

  /**
   * Call a tool with optional result filtering
   */
  async callTool(call: GatewayToolCall): Promise<any> {
    return this.request(`/api/code/tools/${call.toolName}/call`, {
      method: 'POST',
      body: JSON.stringify({
        args: call.args,
        options: call.filter
      })
    });
  }

  /**
   * Call tool with aggregation (for analytics)
   */
  async callToolAggregate(toolName: string, args: Record<string, any>, aggregation: {
    operation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'groupBy' | 'distinct';
    field?: string;
    groupByField?: string;
  }): Promise<any> {
    return this.request(`/api/code/tools/${toolName}/call/aggregate`, {
      method: 'POST',
      body: JSON.stringify({ args, aggregation })
    });
  }

  /**
   * Execute code in the gateway sandbox
   */
  async executeCode(code: string, timeout = 30000): Promise<{ output: string; error?: string }> {
    return this.request('/api/code/execute', {
      method: 'POST',
      body: JSON.stringify({ code, timeout })
    });
  }

  /**
   * List available skills from the gateway
   */
  async listSkills(): Promise<Array<{ name: string; description: string; tags: string[] }>> {
    return this.request('/api/code/skills');
  }

  /**
   * Execute a gateway skill
   */
  async executeSkill(name: string, inputs: Record<string, any> = {}): Promise<any> {
    return this.request(`/api/code/skills/${name}/execute`, {
      method: 'POST',
      body: JSON.stringify(inputs)
    });
  }

  /**
   * Get gateway health status
   */
  async getHealth(): Promise<{
    status: string;
    backends: { connected: number; total: number };
    tools: number;
  }> {
    return this.request('/health');
  }

  /**
   * Search the RAG knowledge base through gateway (if configured)
   * This allows using the gateway's token optimization on RAG results
   */
  async searchWithOptimization(query: string, options?: {
    maxTokens?: number;
    summarize?: boolean;
  }): Promise<any> {
    // Call through gateway's summarization endpoint if available
    if (options?.summarize) {
      return this.request('/api/code/tools/recursive_query/call', {
        method: 'POST',
        body: JSON.stringify({
          args: { query },
          options: {
            maxTokens: options.maxTokens || 500,
            format: 'summary'
          }
        })
      });
    }

    return this.callTool({
      toolName: 'recursive_query',
      args: { query },
      filter: { format: 'summary' }
    });
  }
}

export function createMCPGatewayClient(config: RAGConfig): MCPGatewayClient {
  return new MCPGatewayClient(config);
}
