import type { RAGConfig } from '../../types/index.js';
import { createOpenSkillsClient, type Skill } from '../../integrations/openskills.js';
import { createVectorStore } from '../../adapters/vector/index.js';
import { createEmbedder } from '../../adapters/embeddings/index.js';
import { chunkDocument } from '../../services/chunker.js';
import { randomUUID } from 'crypto';

export async function listOpenSkillsTool(
  config: RAGConfig
): Promise<{ skills: Array<{ name: string; description: string; location: string }> }> {
  const client = createOpenSkillsClient(config);
  
  if (!client.isEnabled()) {
    return { skills: [] };
  }

  const skills = await client.listSkills();
  return {
    skills: skills.map(s => ({
      name: s.name,
      description: s.description,
      location: s.location
    }))
  };
}

export async function readOpenSkillTool(
  config: RAGConfig,
  params: { name: string }
): Promise<{ skill: Skill | null; content: string }> {
  const client = createOpenSkillsClient(config);
  
  if (!client.isEnabled()) {
    throw new Error('OpenSkills integration is not enabled');
  }

  const skill = await client.readSkill(params.name);
  
  if (!skill) {
    return { skill: null, content: '' };
  }

  const content = client.getSkillContent(skill);
  return { skill, content };
}

export async function ingestSkillsTool(
  config: RAGConfig
): Promise<{ ingested: number; skills: string[] }> {
  const client = createOpenSkillsClient(config);
  
  if (!client.isEnabled()) {
    throw new Error('OpenSkills integration is not enabled');
  }

  const vectorStore = createVectorStore(config.vectorStore, config);
  const embedder = await createEmbedder(config.embeddings, config);
  
  const documents = client.skillsToDocuments();
  const ingestedSkills: string[] = [];

  for (const doc of documents) {
    const chunks = chunkDocument(doc.content, {
      chunkSize: 512,
      chunkOverlap: 50
    });

    const embeddings = await embedder.embedBatch(chunks.map(c => c.text));

    const vectorDocs = chunks.map((chunk, i) => ({
      id: randomUUID(),
      embedding: embeddings[i],
      content: chunk.text,
      metadata: {
        ...doc.metadata,
        chunkIndex: i,
        totalChunks: chunks.length
      }
    }));

    await vectorStore.add(vectorDocs);
    ingestedSkills.push(doc.metadata.name);
  }

  return {
    ingested: ingestedSkills.length,
    skills: ingestedSkills
  };
}

export async function searchSkillsTool(
  config: RAGConfig,
  params: { query: string; topK?: number }
): Promise<{ results: Array<{ name: string; content: string; score: number }> }> {
  const client = createOpenSkillsClient(config);
  
  if (!client.isEnabled()) {
    return { results: [] };
  }

  const vectorStore = createVectorStore(config.vectorStore, config);
  const embedder = await createEmbedder(config.embeddings, config);
  
  const embedding = await embedder.embed(params.query);
  
  const results = await vectorStore.search(embedding, {
    topK: params.topK || 5,
    filter: { type: { $in: ['skill'] } }
  });

  return {
    results: results.map((r: any) => ({
      name: r.metadata?.name || 'unknown',
      content: r.content.substring(0, 500),
      score: r.score
    }))
  };
}
