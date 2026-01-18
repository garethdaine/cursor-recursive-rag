import type { RAGConfig } from '../../types/index.js';
import { createMCPGatewayClient } from '../../integrations/mcp-gateway.js';

export async function gatewaySearchToolsTool(
  config: RAGConfig,
  params: { query: string; backend?: string }
): Promise<{ tools: Array<{ name: string; description: string; backend: string }> }> {
  const client = createMCPGatewayClient(config);
  
  if (!client.isEnabled()) {
    return { tools: [] };
  }

  try {
    const result = await client.searchTools(params.query, {
      backend: params.backend,
      detailLevel: 'name_description'
    });
    return result;
  } catch (error) {
    console.error('Gateway search error:', error);
    return { tools: [] };
  }
}

export async function gatewayCallToolTool(
  config: RAGConfig,
  params: { 
    toolName: string; 
    args: Record<string, any>;
    maxRows?: number;
    fields?: string[];
  }
): Promise<any> {
  const client = createMCPGatewayClient(config);
  
  if (!client.isEnabled()) {
    throw new Error('MCP Gateway integration is not enabled');
  }

  return client.callTool({
    toolName: params.toolName,
    args: params.args,
    filter: {
      maxRows: params.maxRows,
      fields: params.fields,
      format: 'summary'
    }
  });
}

export async function gatewayExecuteSkillTool(
  config: RAGConfig,
  params: { name: string; inputs?: Record<string, any> }
): Promise<any> {
  const client = createMCPGatewayClient(config);
  
  if (!client.isEnabled()) {
    throw new Error('MCP Gateway integration is not enabled');
  }

  return client.executeSkill(params.name, params.inputs || {});
}

export async function gatewayHealthTool(
  config: RAGConfig
): Promise<{ status: string; backends: number; tools: number }> {
  const client = createMCPGatewayClient(config);
  
  if (!client.isEnabled()) {
    return { status: 'disabled', backends: 0, tools: 0 };
  }

  try {
    const health = await client.getHealth();
    return {
      status: health.status,
      backends: health.backends.connected,
      tools: health.tools
    };
  } catch (error) {
    return { status: 'error', backends: 0, tools: 0 };
  }
}
