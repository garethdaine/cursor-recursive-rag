# Multi-Agent Orchestration System

## Implementation Plan

**Project Codename:** Conductor  
**Version:** 1.0  
**Last Updated:** January 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technical Stack](#3-technical-stack)
4. [Database Schema](#4-database-schema)
5. [Core Components](#5-core-components)
6. [API Design](#6-api-design)
7. [Linear Integration](#7-linear-integration)
8. [RAG Integration](#8-rag-integration)
9. [Three.js Visualization](#9-threejs-visualization)
10. [MCP Bridge](#10-mcp-bridge)
11. [Dashboard UI](#11-dashboard-ui)
12. [File Structure](#12-file-structure)
13. [Implementation Phases](#13-implementation-phases)
14. [Testing Strategy](#14-testing-strategy)
15. [Security Considerations](#15-security-considerations)
16. [Performance Optimization](#16-performance-optimization)
17. [Future Enhancements](#17-future-enhancements)

---

## 1. Executive Summary

### 1.1 Overview

Conductor is a local-first multi-agent orchestration platform that enables users to configure, deploy, and monitor AI agents working collaboratively on software development tasks. The system integrates with Cursor AI via MCP, Linear for project management, and a custom Recursive RAG system for agent memory and context sharing.

### 1.2 Key Features

- **Agent Configuration**: Define custom agents with roles, rules, and tool access
- **Orchestration Rules**: Configure execution patterns (sequential, parallel, pipeline, swarm)
- **Linear Integration**: Bidirectional sync with Linear issues, automatic status updates
- **RAG Integration**: Agents share context through semantic memory with temporal decay
- **Real-time Visualization**: Three.js-powered 3D view of agents working
- **Run Monitoring**: Live logs, metrics, artifacts, and decision tracking
- **Workspace Management**: Multiple codebases with Git worktree support

### 1.3 Target Users

- Solo developers managing complex projects
- Small teams wanting AI-augmented development workflows
- Organizations exploring autonomous coding pipelines

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 Dashboard                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │
│  │ Agent Setup │ │ Run Control │ │ Monitoring  │ │ Three.js Visualization│  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ WebSocket + REST
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Laravel Backend                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │ Orchestrator │ │ Linear Sync  │ │ Run Manager  │ │ Event Dispatcher │   │
│  │   Engine     │ │   Service    │ │              │ │                  │   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘   │
└─────────┼────────────────┼────────────────┼──────────────────┼──────────────┘
          │                │                │                  │
          ▼                ▼                ▼                  ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐
│   MCP Bridge    │ │  Linear API │ │  Database   │ │   WebSocket Server      │
│  (Cursor Link)  │ │             │ │ (Postgres)  │ │   (Laravel Reverb)      │
└────────┬────────┘ └─────────────┘ └─────────────┘ └─────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MCP Servers                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │ Recursive    │ │  Filesystem  │ │    Git       │ │    Terminal      │   │
│  │    RAG       │ │              │ │              │ │                  │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Interaction Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Linear  │────▶│  Webhook │────▶│Orchestr- │────▶│   MCP    │
│  Issue   │     │ Handler  │     │  ator    │     │  Bridge  │
└──────────┘     └──────────┘     └────┬─────┘     └────┬─────┘
                                       │                │
                                       ▼                ▼
                                 ┌──────────┐     ┌──────────┐
                                 │   Run    │     │  Cursor  │
                                 │  State   │     │  Agent   │
                                 └────┬─────┘     └────┬─────┘
                                      │                │
                      ┌───────────────┼────────────────┤
                      ▼               ▼                ▼
                ┌──────────┐   ┌──────────┐     ┌──────────┐
                │ WebSocket│   │   RAG    │     │  Linear  │
                │ (Live UI)│   │  Store   │     │  Update  │
                └──────────┘   └──────────┘     └──────────┘
```

### 2.3 Data Flow

```
User Input (Dashboard or Linear)
         │
         ▼
    ┌─────────┐
    │  Parse  │──────────────────────────────────┐
    │  Task   │                                  │
    └────┬────┘                                  │
         │                                       │
         ▼                                       ▼
    ┌─────────┐                           ┌───────────┐
    │ Select  │                           │   Query   │
    │ Agents  │                           │    RAG    │
    └────┬────┘                           └─────┬─────┘
         │                                      │
         ▼                                      ▼
    ┌─────────┐                           ┌───────────┐
    │ Build   │◀──────────────────────────│  Context  │
    │ Prompts │                           │  Results  │
    └────┬────┘                           └───────────┘
         │
         ▼
    ┌─────────┐
    │ Execute │
    │ Agents  │
    └────┬────┘
         │
    ┌────┴────┬─────────────┬─────────────┐
    ▼         ▼             ▼             ▼
┌───────┐ ┌───────┐   ┌───────────┐ ┌──────────┐
│ Agent │ │ Agent │   │   Store   │ │  Update  │
│ Logs  │ │ Output│   │  in RAG   │ │  Linear  │
└───────┘ └───────┘   └───────────┘ └──────────┘
```

---

## 3. Technical Stack

### 3.1 Backend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | Laravel | 12.x | Core application framework |
| PHP | PHP | 8.3+ | Runtime |
| Database | PostgreSQL | 16.x | Primary data store |
| Cache | Redis | 7.x | Caching, queues, pub/sub |
| WebSocket | Laravel Reverb | 1.x | Real-time communication |
| Queue | Laravel Horizon | 5.x | Background job processing |

### 3.2 Frontend

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | Vue 3 | 3.5+ | UI framework |
| Meta Framework | Nuxt | 4.x | SSR, routing, modules |
| State | Pinia | 2.x | State management |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Components | Radix Vue | 1.x | Accessible primitives |
| 3D Graphics | Three.js | r170+ | Agent visualization |
| Charts | Chart.js | 4.x | Metrics visualization |

### 3.3 Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| MCP Server | Node.js / TypeScript | Bridge to Cursor |
| Process Manager | Supervisor | Background services |
| Search | Meilisearch | Full-text search |
| File Storage | Local / S3 | Artifact storage |

### 3.4 External Integrations

| Service | API Version | Purpose |
|---------|-------------|---------|
| Linear | GraphQL | Project management |
| GitHub | REST v3 | Repository operations |
| Cursor | Background Agents API v0 | Agent execution |

---

## 4. Database Schema

### 4.1 Core Tables

#### 4.1.1 Workspaces

```sql
CREATE TABLE orchestrator_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    path VARCHAR(1024) NOT NULL,
    git_remote VARCHAR(1024),
    default_branch VARCHAR(255) DEFAULT 'main',
    worktree_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_workspaces_slug ON orchestrator_workspaces(slug);
```

#### 4.1.2 Agents

```sql
CREATE TABLE orchestrator_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    avatar VARCHAR(255),
    description TEXT,
    system_prompt TEXT NOT NULL,
    rules JSONB DEFAULT '[]',
    context_files JSONB DEFAULT '[]',
    mcp_tools JSONB DEFAULT '{"rag": true, "filesystem": true, "terminal": false, "git": true}',
    can_spawn_sub_agents BOOLEAN DEFAULT FALSE,
    max_concurrent_tasks INTEGER DEFAULT 1,
    dependencies JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agents_role ON orchestrator_agents(role);
CREATE INDEX idx_agents_active ON orchestrator_agents(is_active);
```

#### 4.1.3 Orchestration Rules

```sql
CREATE TABLE orchestrator_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    pattern VARCHAR(50) NOT NULL DEFAULT 'sequential',
    max_concurrent_agents INTEGER DEFAULT 4,
    shared_context_enabled BOOLEAN DEFAULT TRUE,
    max_iterations INTEGER DEFAULT 100,
    max_duration INTEGER DEFAULT 3600,
    success_criteria TEXT,
    require_review_before_merge BOOLEAN DEFAULT FALSE,
    require_tests_pass BOOLEAN DEFAULT TRUE,
    global_rules JSONB DEFAULT '[]',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Pattern options: 'sequential', 'parallel', 'pipeline', 'swarm'
```

#### 4.1.4 Run Configurations (Templates)

```sql
CREATE TABLE orchestrator_run_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    workspace_id UUID REFERENCES orchestrator_workspaces(id),
    rules_id UUID REFERENCES orchestrator_rules(id),
    agent_ids JSONB NOT NULL DEFAULT '[]',
    rag_config JSONB DEFAULT '{"ingest_outputs": true, "query_prior_runs": true, "memory_decay": 0.1}',
    is_template BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 4.1.5 Runs

```sql
CREATE TABLE orchestrator_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    
    -- Configuration
    workspace_id UUID NOT NULL REFERENCES orchestrator_workspaces(id),
    rules_id UUID NOT NULL REFERENCES orchestrator_rules(id),
    config_id UUID REFERENCES orchestrator_run_configs(id),
    agent_ids JSONB NOT NULL DEFAULT '[]',
    rag_config JSONB DEFAULT '{}',
    
    -- State
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    current_iteration INTEGER DEFAULT 0,
    
    -- Metrics
    metrics JSONB DEFAULT '{"total_tokens": 0, "files_modified": 0, "tests_run": 0, "rag_queries": 0, "rag_inserts": 0}',
    
    -- Linear Integration
    linear_issue_id VARCHAR(255),
    linear_identifier VARCHAR(50),
    linear_team_id VARCHAR(255),
    
    -- Git
    branch_name VARCHAR(255),
    pull_request_url VARCHAR(1024),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Status options: 'pending', 'running', 'paused', 'completed', 'failed', 'cancelled'

CREATE INDEX idx_runs_status ON orchestrator_runs(status);
CREATE INDEX idx_runs_workspace ON orchestrator_runs(workspace_id);
CREATE INDEX idx_runs_linear ON orchestrator_runs(linear_issue_id);
CREATE INDEX idx_runs_created ON orchestrator_runs(created_at DESC);
```

#### 4.1.6 Agent Instances (Per Run)

```sql
CREATE TABLE orchestrator_agent_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES orchestrator_runs(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES orchestrator_agents(id),
    
    -- State
    status VARCHAR(50) NOT NULL DEFAULT 'idle',
    current_task TEXT,
    progress INTEGER DEFAULT 0,
    current_file VARCHAR(1024),
    
    -- Metrics
    tokens_used INTEGER DEFAULT 0,
    files_modified INTEGER DEFAULT 0,
    
    -- Linear Sub-issue
    linear_sub_issue_id VARCHAR(255),
    linear_sub_identifier VARCHAR(50),
    
    -- Worktree
    worktree_path VARCHAR(1024),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Status options: 'idle', 'working', 'waiting', 'blocked', 'complete', 'failed'

CREATE INDEX idx_agent_instances_run ON orchestrator_agent_instances(run_id);
CREATE INDEX idx_agent_instances_status ON orchestrator_agent_instances(status);
```

#### 4.1.7 Messages / Activity Log

```sql
CREATE TABLE orchestrator_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES orchestrator_runs(id) ON DELETE CASCADE,
    agent_instance_id UUID REFERENCES orchestrator_agent_instances(id) ON DELETE CASCADE,
    
    -- Message Type
    type VARCHAR(50) NOT NULL,
    level VARCHAR(20) DEFAULT 'info',
    
    -- Content
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Type options: 'action', 'decision', 'artifact', 'error', 'rag_query', 'rag_write', 'status_change', 'linear_update'
-- Level options: 'debug', 'info', 'warning', 'error'

CREATE INDEX idx_messages_run ON orchestrator_messages(run_id);
CREATE INDEX idx_messages_agent ON orchestrator_messages(agent_instance_id);
CREATE INDEX idx_messages_type ON orchestrator_messages(type);
CREATE INDEX idx_messages_created ON orchestrator_messages(created_at);
```

#### 4.1.8 Artifacts

```sql
CREATE TABLE orchestrator_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES orchestrator_runs(id) ON DELETE CASCADE,
    agent_instance_id UUID REFERENCES orchestrator_agent_instances(id) ON DELETE CASCADE,
    
    -- Artifact Info
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(1024),
    
    -- Content
    content TEXT,
    diff TEXT,
    
    -- Storage
    storage_path VARCHAR(1024),
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Type options: 'file_created', 'file_modified', 'file_deleted', 'document', 'decision', 'test_result'

CREATE INDEX idx_artifacts_run ON orchestrator_artifacts(run_id);
CREATE INDEX idx_artifacts_type ON orchestrator_artifacts(type);
```

#### 4.1.9 Decisions

```sql
CREATE TABLE orchestrator_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES orchestrator_runs(id) ON DELETE CASCADE,
    agent_instance_id UUID NOT NULL REFERENCES orchestrator_agent_instances(id) ON DELETE CASCADE,
    
    -- Decision
    category VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT,
    
    -- Impact
    affected_files JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    
    -- RAG
    rag_chunk_id VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_decisions_run ON orchestrator_decisions(run_id);
CREATE INDEX idx_decisions_category ON orchestrator_decisions(category);
```

### 4.2 Linear Integration Tables

```sql
CREATE TABLE orchestrator_linear_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES orchestrator_workspaces(id) ON DELETE CASCADE,
    
    -- Linear Connection
    team_id VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    
    -- Trigger Configuration
    trigger_label_id VARCHAR(255) NOT NULL,
    trigger_label_name VARCHAR(255),
    
    -- Status Mapping
    status_mapping JSONB NOT NULL DEFAULT '{
        "pending": null,
        "running": null,
        "paused": null,
        "completed": null,
        "failed": null
    }',
    
    -- Agent to Label Mapping
    agent_labels JSONB DEFAULT '{}',
    
    -- Behavior Settings
    create_sub_issues BOOLEAN DEFAULT TRUE,
    post_comments BOOLEAN DEFAULT TRUE,
    attach_artifacts BOOLEAN DEFAULT TRUE,
    link_prs BOOLEAN DEFAULT TRUE,
    auto_trigger_on_label BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(workspace_id, team_id)
);
```

### 4.3 RAG Integration Tables

```sql
CREATE TABLE orchestrator_rag_namespaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    workspace_id UUID REFERENCES orchestrator_workspaces(id),
    
    -- Settings
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
    chunk_size INTEGER DEFAULT 1024,
    chunk_overlap INTEGER DEFAULT 128,
    
    -- Decay Settings
    temporal_decay_enabled BOOLEAN DEFAULT TRUE,
    decay_factor FLOAT DEFAULT 0.1,
    decay_interval_hours INTEGER DEFAULT 24,
    
    -- Stats
    total_chunks INTEGER DEFAULT 0,
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track which chunks belong to which runs
CREATE TABLE orchestrator_rag_run_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES orchestrator_runs(id) ON DELETE CASCADE,
    namespace_id UUID NOT NULL REFERENCES orchestrator_rag_namespaces(id),
    chunk_ids JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.4 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Workspaces    │       │     Agents      │       │      Rules      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │       │ id              │
│ name            │       │ name            │       │ name            │
│ path            │       │ role            │       │ pattern         │
│ git_remote      │       │ system_prompt   │       │ max_concurrent  │
└────────┬────────┘       │ mcp_tools       │       │ global_rules    │
         │                └─────────────────┘       └────────┬────────┘
         │                        │                          │
         │    ┌───────────────────┼──────────────────────────┘
         │    │                   │
         ▼    ▼                   ▼
┌─────────────────────────────────────────┐
│                 Runs                     │
├─────────────────────────────────────────┤
│ id                                       │
│ workspace_id ─────────────────────────┐ │
│ rules_id ─────────────────────────────┘ │
│ agent_ids[]                              │
│ prompt                                   │
│ status                                   │
│ linear_issue_id                          │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┬────────────┐
    ▼            ▼            ▼            ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Agent   │ │ Messages │ │Artifacts │ │Decisions │
│Instance│ │          │ │          │ │          │
└────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 5. Core Components

### 5.1 Orchestrator Engine

The central component managing agent coordination and run execution.

```php
<?php

namespace App\Services\Orchestrator;

use App\Models\Orchestrator\Run;
use App\Models\Orchestrator\AgentInstance;
use App\Events\Orchestrator\RunStarted;
use App\Events\Orchestrator\AgentStatusChanged;

class OrchestratorEngine
{
    public function __construct(
        private MCPBridge $mcp,
        private RAGService $rag,
        private LinearSyncService $linear,
        private RunStateManager $stateManager,
    ) {}

    public function startRun(Run $run): void
    {
        $run->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        event(new RunStarted($run));

        // Create agent instances
        foreach ($run->agent_ids as $agentId) {
            $instance = $this->createAgentInstance($run, $agentId);
            $this->stateManager->register($instance);
        }

        // Start execution based on pattern
        match ($run->rules->pattern) {
            'sequential' => $this->executeSequential($run),
            'parallel' => $this->executeParallel($run),
            'pipeline' => $this->executePipeline($run),
            'swarm' => $this->executeSwarm($run),
        };
    }

    private function executeSequential(Run $run): void
    {
        $instances = $run->agentInstances()->orderBy('created_at')->get();

        foreach ($instances as $instance) {
            if ($run->fresh()->status !== 'running') {
                break;
            }

            $this->executeAgent($instance);
            $this->waitForCompletion($instance);
        }

        $this->completeRun($run);
    }

    private function executeParallel(Run $run): void
    {
        $instances = $run->agentInstances;
        $maxConcurrent = $run->rules->max_concurrent_agents;

        $chunks = $instances->chunk($maxConcurrent);

        foreach ($chunks as $chunk) {
            $jobs = $chunk->map(fn ($instance) => 
                new ExecuteAgentJob($instance)
            );

            Bus::batch($jobs)
                ->then(fn () => $this->onBatchComplete($run))
                ->dispatch();
        }
    }

    private function executeAgent(AgentInstance $instance): void
    {
        $instance->update(['status' => 'working', 'started_at' => now()]);
        event(new AgentStatusChanged($instance));

        // Build context from RAG
        $context = $this->buildAgentContext($instance);

        // Execute via MCP
        $result = $this->mcp->executeAgent(
            agent: $instance->agent,
            prompt: $this->buildPrompt($instance, $context),
            workspace: $instance->run->workspace,
            callbacks: $this->createCallbacks($instance),
        );

        // Store outputs in RAG
        $this->storeOutputsInRAG($instance, $result);

        $instance->update([
            'status' => 'complete',
            'completed_at' => now(),
        ]);
        event(new AgentStatusChanged($instance));
    }

    private function buildAgentContext(AgentInstance $instance): array
    {
        $run = $instance->run;

        // Query RAG for relevant context
        $ragResults = $this->rag->multiHopQuery(
            query: $run->prompt,
            namespace: $run->rag_config['namespace'] ?? 'default',
            filters: [
                'run_id' => $run->id,
                'max_age' => '24h',
            ],
            hops: 3,
        );

        // Get decisions from completed agents
        $priorDecisions = $run->decisions()
            ->whereHas('agentInstance', fn ($q) => 
                $q->where('status', 'complete')
            )
            ->get();

        return [
            'rag_chunks' => $ragResults->chunks,
            'prior_decisions' => $priorDecisions,
            'completed_agents' => $run->agentInstances()
                ->where('status', 'complete')
                ->with('agent')
                ->get(),
        ];
    }

    private function buildPrompt(AgentInstance $instance, array $context): string
    {
        $agent = $instance->agent;
        $run = $instance->run;

        return view('orchestrator.prompts.agent', [
            'agent' => $agent,
            'run' => $run,
            'context' => $context,
            'global_rules' => $run->rules->global_rules,
        ])->render();
    }

    private function createCallbacks(AgentInstance $instance): array
    {
        return [
            'onProgress' => function ($progress) use ($instance) {
                $instance->update(['progress' => $progress]);
                $this->broadcastProgress($instance);
            },
            'onFileChange' => function ($file, $action) use ($instance) {
                $this->recordArtifact($instance, $file, $action);
            },
            'onDecision' => function ($decision) use ($instance) {
                $this->recordDecision($instance, $decision);
            },
            'onRAGQuery' => function ($query, $results) use ($instance) {
                $this->logMessage($instance, 'rag_query', $query, [
                    'results_count' => count($results),
                ]);
            },
        ];
    }
}
```

### 5.2 Run State Manager

Tracks and manages the state of all active runs.

```php
<?php

namespace App\Services\Orchestrator;

use App\Models\Orchestrator\Run;
use App\Models\Orchestrator\AgentInstance;
use Illuminate\Support\Facades\Redis;

class RunStateManager
{
    private const CACHE_PREFIX = 'orchestrator:run:';

    public function register(AgentInstance $instance): void
    {
        $key = $this->getRunKey($instance->run_id);
        
        Redis::hset($key, $instance->id, json_encode([
            'agent_id' => $instance->agent_id,
            'status' => $instance->status,
            'progress' => $instance->progress,
            'current_file' => $instance->current_file,
            'updated_at' => now()->toIso8601String(),
        ]));
    }

    public function updateStatus(AgentInstance $instance): void
    {
        $this->register($instance);
        $this->checkDependencies($instance);
        $this->broadcastState($instance->run_id);
    }

    public function getRunState(string $runId): array
    {
        $key = $this->getRunKey($runId);
        $data = Redis::hgetall($key);

        return collect($data)
            ->map(fn ($json) => json_decode($json, true))
            ->all();
    }

    private function checkDependencies(AgentInstance $instance): void
    {
        if ($instance->status !== 'complete') {
            return;
        }

        // Find agents waiting on this one
        $waitingInstances = AgentInstance::query()
            ->where('run_id', $instance->run_id)
            ->where('status', 'waiting')
            ->whereJsonContains('agent.dependencies', $instance->agent_id)
            ->get();

        foreach ($waitingInstances as $waiting) {
            $allDependenciesMet = $this->checkAllDependencies($waiting);
            
            if ($allDependenciesMet) {
                dispatch(new ExecuteAgentJob($waiting));
            }
        }
    }

    private function broadcastState(string $runId): void
    {
        $state = $this->getRunState($runId);
        
        broadcast(new RunStateUpdated($runId, $state));
    }
}
```

### 5.3 MCP Bridge

Interfaces with Cursor AI via MCP protocol.

```php
<?php

namespace App\Services\Orchestrator;

use App\Models\Orchestrator\Agent;
use App\Models\Orchestrator\Workspace;

class MCPBridge
{
    private MCPClient $client;

    public function __construct()
    {
        $this->client = new MCPClient(
            host: config('orchestrator.mcp.host', 'localhost'),
            port: config('orchestrator.mcp.port', 3100),
        );
    }

    public function executeAgent(
        Agent $agent,
        string $prompt,
        Workspace $workspace,
        array $callbacks = [],
    ): AgentExecutionResult {
        // Prepare tool configuration based on agent settings
        $tools = $this->prepareTools($agent);

        // Create execution session
        $session = $this->client->createSession([
            'workspace_path' => $workspace->path,
            'tools' => $tools,
        ]);

        // Execute with streaming callbacks
        $result = $session->execute($prompt, [
            'onChunk' => function ($chunk) use ($callbacks) {
                $this->processChunk($chunk, $callbacks);
            },
            'onToolCall' => function ($tool, $args, $result) use ($callbacks) {
                $this->processToolCall($tool, $args, $result, $callbacks);
            },
        ]);

        return new AgentExecutionResult(
            success: $result->success,
            output: $result->output,
            artifacts: $result->artifacts,
            toolCalls: $result->toolCalls,
            tokensUsed: $result->tokensUsed,
        );
    }

    private function prepareTools(Agent $agent): array
    {
        $tools = [];

        if ($agent->mcp_tools['rag'] ?? false) {
            $tools[] = [
                'name' => 'rag',
                'server' => 'recursive-rag',
                'methods' => ['query', 'multiHopQuery', 'ingest'],
            ];
        }

        if ($agent->mcp_tools['filesystem'] ?? false) {
            $tools[] = [
                'name' => 'filesystem',
                'server' => 'filesystem',
                'methods' => ['read', 'write', 'list', 'search'],
            ];
        }

        if ($agent->mcp_tools['git'] ?? false) {
            $tools[] = [
                'name' => 'git',
                'server' => 'git',
                'methods' => ['status', 'diff', 'commit', 'branch'],
            ];
        }

        if ($agent->mcp_tools['terminal'] ?? false) {
            $tools[] = [
                'name' => 'terminal',
                'server' => 'terminal',
                'methods' => ['execute'],
                'restrictions' => $agent->mcp_tools['terminal_restrictions'] ?? [],
            ];
        }

        return $tools;
    }

    private function processChunk(mixed $chunk, array $callbacks): void
    {
        if (isset($chunk['progress']) && isset($callbacks['onProgress'])) {
            $callbacks['onProgress']($chunk['progress']);
        }

        if (isset($chunk['file']) && isset($callbacks['onFileChange'])) {
            $callbacks['onFileChange']($chunk['file'], $chunk['action'] ?? 'modified');
        }
    }

    public function queryRAG(string $query, array $options = []): RAGQueryResult
    {
        return $this->client->call('recursive-rag', 'multiHopQuery', [
            'query' => $query,
            ...$options,
        ]);
    }

    public function ingestToRAG(string $content, array $metadata): void
    {
        $this->client->call('recursive-rag', 'ingest', [
            'content' => $content,
            'metadata' => $metadata,
            'extractEntities' => true,
        ]);
    }
}
```

---

## 6. API Design

### 6.1 REST API Endpoints

#### 6.1.1 Workspaces

```
GET    /api/orchestrator/workspaces
POST   /api/orchestrator/workspaces
GET    /api/orchestrator/workspaces/{id}
PUT    /api/orchestrator/workspaces/{id}
DELETE /api/orchestrator/workspaces/{id}
POST   /api/orchestrator/workspaces/{id}/scan          # Scan for Git info
```

#### 6.1.2 Agents

```
GET    /api/orchestrator/agents
POST   /api/orchestrator/agents
GET    /api/orchestrator/agents/{id}
PUT    /api/orchestrator/agents/{id}
DELETE /api/orchestrator/agents/{id}
POST   /api/orchestrator/agents/{id}/duplicate
GET    /api/orchestrator/agents/roles                  # List available roles
```

#### 6.1.3 Orchestration Rules

```
GET    /api/orchestrator/rules
POST   /api/orchestrator/rules
GET    /api/orchestrator/rules/{id}
PUT    /api/orchestrator/rules/{id}
DELETE /api/orchestrator/rules/{id}
POST   /api/orchestrator/rules/{id}/set-default
```

#### 6.1.4 Runs

```
GET    /api/orchestrator/runs
POST   /api/orchestrator/runs                          # Create and start run
GET    /api/orchestrator/runs/{id}
DELETE /api/orchestrator/runs/{id}
POST   /api/orchestrator/runs/{id}/pause
POST   /api/orchestrator/runs/{id}/resume
POST   /api/orchestrator/runs/{id}/cancel
GET    /api/orchestrator/runs/{id}/messages            # Activity log
GET    /api/orchestrator/runs/{id}/artifacts
GET    /api/orchestrator/runs/{id}/decisions
GET    /api/orchestrator/runs/{id}/state               # Real-time state
```

#### 6.1.5 Run Configurations (Templates)

```
GET    /api/orchestrator/configs
POST   /api/orchestrator/configs
GET    /api/orchestrator/configs/{id}
PUT    /api/orchestrator/configs/{id}
DELETE /api/orchestrator/configs/{id}
POST   /api/orchestrator/configs/{id}/run              # Start run from template
```

#### 6.1.6 Linear Integration

```
GET    /api/orchestrator/linear/config/{workspaceId}
PUT    /api/orchestrator/linear/config/{workspaceId}
GET    /api/orchestrator/linear/teams                  # List available teams
GET    /api/orchestrator/linear/labels/{teamId}        # List team labels
GET    /api/orchestrator/linear/statuses/{teamId}      # List team statuses
POST   /api/orchestrator/linear/sync-labels            # Create required labels
GET    /api/orchestrator/linear/issues                 # Search issues
POST   /api/orchestrator/linear/webhook                # Webhook receiver
```

### 6.2 WebSocket Events

#### 6.2.1 Client → Server

```typescript
// Subscribe to run updates
{ event: 'run.subscribe', data: { runId: string } }

// Unsubscribe from run
{ event: 'run.unsubscribe', data: { runId: string } }

// Request current state
{ event: 'run.getState', data: { runId: string } }
```

#### 6.2.2 Server → Client

```typescript
// Run status changed
{ 
  event: 'run.status', 
  data: { 
    runId: string,
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed',
    metrics: RunMetrics
  } 
}

// Agent status changed
{ 
  event: 'agent.status', 
  data: { 
    runId: string,
    agentInstanceId: string,
    agentId: string,
    status: string,
    progress: number,
    currentFile?: string
  } 
}

// New message/log entry
{ 
  event: 'run.message', 
  data: { 
    runId: string,
    message: Message
  } 
}

// Artifact created
{ 
  event: 'run.artifact', 
  data: { 
    runId: string,
    artifact: Artifact
  } 
}

// Metrics updated
{ 
  event: 'run.metrics', 
  data: { 
    runId: string,
    metrics: RunMetrics
  } 
}

// Full state update (for visualization)
{ 
  event: 'run.state', 
  data: { 
    runId: string,
    agents: AgentState[],
    connections: Connection[],
    metrics: RunMetrics
  } 
}
```

### 6.3 Request/Response Schemas

#### 6.3.1 Create Run Request

```typescript
interface CreateRunRequest {
  name: string;
  prompt: string;
  workspaceId: string;
  rulesId: string;
  agentIds: string[];
  
  // Optional
  configId?: string;              // Use template
  linearIssueId?: string;         // Link to Linear
  ragConfig?: {
    ingestOutputs?: boolean;
    queryPriorRuns?: boolean;
    memoryDecay?: number;
    namespace?: string;
  };
  branchName?: string;            // Custom branch name
}
```

#### 6.3.2 Run Response

```typescript
interface RunResponse {
  id: string;
  name: string;
  prompt: string;
  status: RunStatus;
  
  workspace: WorkspaceReference;
  rules: RulesReference;
  agents: AgentReference[];
  
  metrics: {
    totalTokens: number;
    filesModified: number;
    testsRun: number;
    ragQueries: number;
    ragInserts: number;
  };
  
  linear?: {
    issueId: string;
    identifier: string;
    url: string;
  };
  
  git?: {
    branch: string;
    pullRequestUrl?: string;
  };
  
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 7. Linear Integration

### 7.1 Webhook Handler

```php
<?php

namespace App\Http\Controllers\Orchestrator;

use App\Services\Orchestrator\LinearSyncService;
use Illuminate\Http\Request;

class LinearWebhookController extends Controller
{
    public function __construct(
        private LinearSyncService $linearSync,
    ) {}

    public function handle(Request $request)
    {
        $payload = $request->all();
        
        // Verify webhook signature
        if (!$this->verifySignature($request)) {
            return response('Invalid signature', 401);
        }

        match ($payload['type']) {
            'Issue' => $this->handleIssue($payload),
            'Comment' => $this->handleComment($payload),
            'IssueLabel' => $this->handleLabelChange($payload),
            default => null,
        };

        return response('OK', 200);
    }

    private function handleIssue(array $payload): void
    {
        $action = $payload['action'];
        $issue = $payload['data'];

        match ($action) {
            'update' => $this->linearSync->onIssueUpdated($issue),
            'create' => $this->linearSync->onIssueCreated($issue),
            'remove' => $this->linearSync->onIssueDeleted($issue),
            default => null,
        };
    }

    private function handleLabelChange(array $payload): void
    {
        // Check if trigger label was added/removed
        $this->linearSync->onLabelChanged($payload);
    }
}
```

### 7.2 Linear Sync Service

```php
<?php

namespace App\Services\Orchestrator;

use App\Models\Orchestrator\Run;
use App\Models\Orchestrator\LinearConfig;
use App\Services\Linear\LinearClient;

class LinearSyncService
{
    public function __construct(
        private LinearClient $linear,
        private OrchestratorEngine $orchestrator,
    ) {}

    public function onIssueUpdated(array $issue): void
    {
        // Find workspace config for this team
        $config = LinearConfig::where('team_id', $issue['team']['id'])->first();
        
        if (!$config || !$config->auto_trigger_on_label) {
            return;
        }

        // Check if issue has trigger label
        $hasTriggerLabel = collect($issue['labels'] ?? [])
            ->contains('id', $config->trigger_label_id);

        if (!$hasTriggerLabel) {
            return;
        }

        // Check if status changed to "started"
        $isStarted = ($issue['state']['type'] ?? null) === 'started';
        
        // Check if we already have a run for this issue
        $existingRun = Run::where('linear_issue_id', $issue['id'])
            ->whereIn('status', ['pending', 'running', 'paused'])
            ->first();

        if ($isStarted && !$existingRun) {
            $this->createRunFromIssue($issue, $config);
        }
    }

    public function createRunFromIssue(array $issue, LinearConfig $config): Run
    {
        // Determine agents from labels
        $agentIds = $this->mapLabelsToAgents($issue['labels'] ?? [], $config);

        if (empty($agentIds)) {
            $agentIds = $config->default_agent_ids ?? [];
        }

        // Create run
        $run = Run::create([
            'name' => $issue['title'],
            'prompt' => $issue['description'] ?? $issue['title'],
            'workspace_id' => $config->workspace_id,
            'rules_id' => $config->default_rules_id,
            'agent_ids' => $agentIds,
            'linear_issue_id' => $issue['id'],
            'linear_identifier' => $issue['identifier'],
            'linear_team_id' => $issue['team']['id'],
            'rag_config' => [
                'ingest_outputs' => true,
                'query_prior_runs' => true,
                'namespace' => 'linear-' . $issue['identifier'],
            ],
        ]);

        // Update Linear issue
        $this->linear->updateIssue($issue['id'], [
            'stateId' => $config->status_mapping['running'],
        ]);

        // Add comment
        $this->linear->createComment($issue['id'], [
            'body' => $this->formatRunStartedComment($run),
        ]);

        // Start the run
        $this->orchestrator->startRun($run);

        return $run;
    }

    public function onRunCompleted(Run $run): void
    {
        if (!$run->linear_issue_id) {
            return;
        }

        $config = LinearConfig::where('team_id', $run->linear_team_id)->first();

        // Update status
        $this->linear->updateIssue($run->linear_issue_id, [
            'stateId' => $config->status_mapping['completed'],
        ]);

        // Post summary comment
        $this->linear->createComment($run->linear_issue_id, [
            'body' => $this->formatRunCompletedComment($run),
        ]);

        // Link PR if created
        if ($run->pull_request_url) {
            $this->linear->attachLink($run->linear_issue_id, [
                'url' => $run->pull_request_url,
                'title' => 'Pull Request',
            ]);
        }

        // Close sub-issues
        foreach ($run->agentInstances as $instance) {
            if ($instance->linear_sub_issue_id) {
                $this->linear->updateIssue($instance->linear_sub_issue_id, [
                    'stateId' => $config->status_mapping['completed'],
                ]);
            }
        }
    }

    private function formatRunCompletedComment(Run $run): string
    {
        $metrics = $run->metrics;
        $duration = $run->completed_at->diffForHumans($run->started_at, true);

        return <<<MARKDOWN
## 🎉 Orchestrator Run Completed

**Duration:** {$duration}
**Agents:** {$run->agentInstances->count()}

### Metrics
| Metric | Value |
|--------|-------|
| Tokens Used | {$metrics['total_tokens']} |
| Files Modified | {$metrics['files_modified']} |
| RAG Queries | {$metrics['rag_queries']} |

### Key Decisions
{$this->formatDecisions($run->decisions)}

[View Full Report]({$this->getDashboardUrl($run)})
MARKDOWN;
    }

    private function mapLabelsToAgents(array $labels, LinearConfig $config): array
    {
        $agentLabels = $config->agent_labels ?? [];
        
        return collect($labels)
            ->map(fn ($label) => $agentLabels[$label['id']] ?? null)
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
```

### 7.3 Linear Labels Setup

```php
<?php

namespace App\Services\Orchestrator;

class LinearLabelSetup
{
    private const REQUIRED_LABELS = [
        // Trigger label
        [
            'name' => '🤖 AI Task',
            'color' => '#8B5CF6',
            'description' => 'Triggers orchestrator when moved to In Progress',
        ],
        // Agent role labels
        [
            'name' => '🏗️ Architect',
            'color' => '#F59E0B',
            'description' => 'Requires architecture agent',
        ],
        [
            'name' => '⚙️ Backend',
            'color' => '#3B82F6',
            'description' => 'Requires backend agent',
        ],
        [
            'name' => '🎨 Frontend',
            'color' => '#EC4899',
            'description' => 'Requires frontend agent',
        ],
        [
            'name' => '🧪 Testing',
            'color' => '#10B981',
            'description' => 'Requires testing agent',
        ],
        [
            'name' => '📝 Docs',
            'color' => '#6366F1',
            'description' => 'Requires documentation agent',
        ],
        [
            'name' => '👀 Review',
            'color' => '#F97316',
            'description' => 'Requires code review agent',
        ],
        // Status labels
        [
            'name' => '🔄 AI Running',
            'color' => '#3B82F6',
            'description' => 'Orchestrator is actively working',
        ],
        [
            'name' => '✅ AI Complete',
            'color' => '#10B981',
            'description' => 'Orchestrator finished successfully',
        ],
        [
            'name' => '❌ AI Failed',
            'color' => '#EF4444',
            'description' => 'Orchestrator encountered an error',
        ],
    ];

    public function __construct(private LinearClient $linear) {}

    public function setupLabels(string $teamId): array
    {
        $created = [];

        foreach (self::REQUIRED_LABELS as $label) {
            $result = $this->linear->createIssueLabel([
                'teamId' => $teamId,
                ...$label,
            ]);

            $created[] = [
                'name' => $label['name'],
                'id' => $result['id'],
            ];
        }

        return $created;
    }
}
```

---

## 8. RAG Integration

### 8.1 RAG Service

```php
<?php

namespace App\Services\Orchestrator;

use App\Services\RAG\RecursiveRAGClient;

class RAGService
{
    public function __construct(
        private RecursiveRAGClient $rag,
    ) {}

    public function multiHopQuery(
        string $query,
        string $namespace,
        array $filters = [],
        int $hops = 3,
    ): RAGQueryResult {
        return $this->rag->multiHopQuery([
            'query' => $query,
            'namespace' => $namespace,
            'filters' => $filters,
            'hops' => $hops,
            'includeMetadata' => true,
        ]);
    }

    public function ingestAgentOutput(
        AgentInstance $instance,
        string $content,
        string $type,
    ): void {
        $run = $instance->run;
        $agent = $instance->agent;

        $this->rag->ingest([
            'content' => $content,
            'namespace' => $run->rag_config['namespace'] ?? 'default',
            'metadata' => [
                'type' => 'agent_output',
                'output_type' => $type,
                'run_id' => $run->id,
                'agent_id' => $agent->id,
                'agent_name' => $agent->name,
                'agent_role' => $agent->role,
                'timestamp' => now()->toIso8601String(),
            ],
            'extractEntities' => true,
        ]);

        // Update run metrics
        $run->increment('metrics->rag_inserts');
    }

    public function ingestDecision(
        AgentInstance $instance,
        Decision $decision,
    ): string {
        $run = $instance->run;

        $result = $this->rag->ingest([
            'content' => $this->formatDecisionForRAG($decision),
            'namespace' => $run->rag_config['namespace'] ?? 'default',
            'metadata' => [
                'type' => 'decision',
                'category' => $decision->category,
                'run_id' => $run->id,
                'agent_id' => $instance->agent_id,
                'affected_files' => $decision->affected_files,
                'timestamp' => now()->toIso8601String(),
            ],
            'extractEntities' => true,
        ]);

        return $result['chunkId'];
    }

    public function queryPriorRuns(
        Workspace $workspace,
        string $query,
        int $limit = 10,
    ): array {
        return $this->rag->query([
            'query' => $query,
            'namespace' => 'workspace-' . $workspace->id,
            'filters' => [
                'type' => ['agent_output', 'decision'],
            ],
            'limit' => $limit,
            'includeMetadata' => true,
        ]);
    }

    private function formatDecisionForRAG(Decision $decision): string
    {
        return <<<TEXT
## Decision: {$decision->category}

**Summary:** {$decision->summary}

**Reasoning:**
{$decision->reasoning}

**Affected Files:**
{$this->formatFileList($decision->affected_files)}
TEXT;
    }
}
```

### 8.2 Context Builder

```php
<?php

namespace App\Services\Orchestrator;

class ContextBuilder
{
    public function __construct(
        private RAGService $rag,
    ) {}

    public function buildForAgent(AgentInstance $instance): AgentContext
    {
        $run = $instance->run;
        $agent = $instance->agent;

        // 1. Query RAG for task-relevant context
        $ragContext = $this->rag->multiHopQuery(
            query: $run->prompt,
            namespace: $run->rag_config['namespace'] ?? 'default',
            filters: [
                'run_id' => $run->id,
            ],
            hops: 3,
        );

        // 2. Get outputs from completed agents in this run
        $completedOutputs = $this->getCompletedAgentOutputs($run, $instance);

        // 3. Get decisions that affect this agent's work
        $relevantDecisions = $this->getRelevantDecisions($run, $agent);

        // 4. Query prior runs if enabled
        $priorRunContext = [];
        if ($run->rag_config['query_prior_runs'] ?? false) {
            $priorRunContext = $this->rag->queryPriorRuns(
                workspace: $run->workspace,
                query: $run->prompt,
                limit: 5,
            );
        }

        // 5. Load agent's context files
        $contextFiles = $this->loadContextFiles($agent, $run->workspace);

        return new AgentContext(
            ragChunks: $ragContext->chunks,
            completedOutputs: $completedOutputs,
            decisions: $relevantDecisions,
            priorRunContext: $priorRunContext,
            contextFiles: $contextFiles,
        );
    }

    private function getCompletedAgentOutputs(Run $run, AgentInstance $current): array
    {
        return $run->agentInstances()
            ->where('id', '!=', $current->id)
            ->where('status', 'complete')
            ->with(['agent', 'artifacts', 'decisions'])
            ->get()
            ->map(fn ($instance) => [
                'agent' => $instance->agent->name,
                'role' => $instance->agent->role,
                'artifacts' => $instance->artifacts->map(fn ($a) => [
                    'type' => $a->type,
                    'path' => $a->path,
                    'summary' => $a->metadata['summary'] ?? null,
                ]),
                'decisions' => $instance->decisions->map(fn ($d) => [
                    'category' => $d->category,
                    'summary' => $d->summary,
                ]),
            ])
            ->all();
    }

    private function getRelevantDecisions(Run $run, Agent $agent): array
    {
        // Get decisions that might affect this agent based on role
        $relevantCategories = match ($agent->role) {
            'backend' => ['architecture', 'database', 'api'],
            'frontend' => ['architecture', 'ui', 'api'],
            'tester' => ['architecture', 'api', 'database'],
            'reviewer' => ['*'], // All decisions relevant
            default => [],
        };

        $query = $run->decisions();

        if (!in_array('*', $relevantCategories)) {
            $query->whereIn('category', $relevantCategories);
        }

        return $query->get()->map(fn ($d) => [
            'agent' => $d->agentInstance->agent->name,
            'category' => $d->category,
            'summary' => $d->summary,
            'reasoning' => $d->reasoning,
        ])->all();
    }
}
```

---

## 9. Three.js Visualization

### 9.1 Visualization Component Structure

```
components/orchestrator/visualization/
├── AgentVisualization.vue          # Main container
├── composables/
│   ├── useThreeScene.ts            # Scene setup
│   ├── useAgentNodes.ts            # Agent sphere management
│   ├── useConnections.ts           # Connection lines
│   ├── useParticles.ts             # Particle effects
│   └── useLabels.ts                # Floating labels
├── objects/
│   ├── TaskNode.ts                 # Central task orb
│   ├── AgentNode.ts                # Agent sphere
│   ├── ConnectionLine.ts           # Agent connections
│   ├── ParticleSystem.ts           # Data flow particles
│   └── FloatingLabel.ts            # Text labels
├── layouts/
│   ├── OrbitalLayout.ts            # Circular orbit
│   ├── NetworkLayout.ts            # Force-directed
│   └── TimelineLayout.ts           # Horizontal lanes
└── shaders/
    ├── glow.vert                   # Glow vertex shader
    ├── glow.frag                   # Glow fragment shader
    └── particle.frag               # Particle shader
```

### 9.2 Main Visualization Component

```vue
<template>
  <div ref="containerRef" class="relative w-full h-full min-h-[500px]">
    <!-- Three.js renders here -->
    
    <!-- Overlay UI -->
    <div class="absolute top-4 left-4 z-10">
      <div class="bg-black/60 backdrop-blur-sm rounded-lg p-4 text-white">
        <h3 class="font-mono text-sm opacity-60">Run</h3>
        <p class="font-semibold">{{ run.name }}</p>
        <div v-if="run.linearIdentifier" class="mt-1">
          <span class="px-2 py-0.5 bg-indigo-500/30 rounded text-xs">
            {{ run.linearIdentifier }}
          </span>
        </div>
      </div>
    </div>
    
    <!-- Metrics panel -->
    <div class="absolute top-4 right-4 z-10">
      <div class="bg-black/60 backdrop-blur-sm rounded-lg p-4 text-white space-y-2">
        <MetricRow label="Tokens" :value="metrics.totalTokens" />
        <MetricRow label="Files" :value="metrics.filesModified" />
        <MetricRow label="RAG Queries" :value="metrics.ragQueries" />
        <MetricRow label="Duration" :value="formattedDuration" />
      </div>
    </div>
    
    <!-- Agent tooltip -->
    <Transition name="fade">
      <AgentTooltip 
        v-if="hoveredAgent" 
        :agent="hoveredAgent"
        :position="tooltipPosition"
      />
    </Transition>
    
    <!-- View mode controls -->
    <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
      <div class="bg-black/60 backdrop-blur-sm rounded-full p-1 flex gap-1">
        <button
          v-for="mode in viewModes"
          :key="mode.id"
          @click="setViewMode(mode.id)"
          class="px-4 py-2 rounded-full text-sm transition-colors"
          :class="viewMode === mode.id 
            ? 'bg-white text-black' 
            : 'text-white hover:bg-white/20'"
        >
          {{ mode.icon }} {{ mode.label }}
        </button>
      </div>
    </div>
    
    <!-- Fullscreen toggle -->
    <button 
      @click="toggleFullscreen"
      class="absolute bottom-4 right-4 z-10 p-2 bg-black/60 rounded-lg text-white hover:bg-black/80"
    >
      <ExpandIcon v-if="!isFullscreen" class="w-5 h-5" />
      <ShrinkIcon v-else class="w-5 h-5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useThreeScene } from './composables/useThreeScene'
import { useAgentNodes } from './composables/useAgentNodes'
import { useConnections } from './composables/useConnections'
import { useParticles } from './composables/useParticles'
import type { Run, AgentState, RunMetrics } from '~/types/orchestrator'

const props = defineProps<{
  run: Run
  agents: AgentState[]
  metrics: RunMetrics
}>()

const containerRef = ref<HTMLElement>()
const hoveredAgent = ref<AgentState | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })
const viewMode = ref<'orbital' | 'network' | 'timeline'>('orbital')
const isFullscreen = ref(false)

const viewModes = [
  { id: 'orbital', label: 'Orbital', icon: '🌐' },
  { id: 'network', label: 'Network', icon: '🕸️' },
  { id: 'timeline', label: 'Timeline', icon: '📊' },
]

// Initialize Three.js scene
const { 
  scene, 
  camera, 
  renderer, 
  controls,
  raycaster,
  animate,
  dispose 
} = useThreeScene(containerRef)

// Agent nodes management
const { 
  nodes, 
  createNode, 
  updateNode, 
  removeNode,
  getNodeByAgentId 
} = useAgentNodes(scene)

// Connection lines
const { 
  connections, 
  createConnection, 
  updateConnection,
  pulseConnection 
} = useConnections(scene)

// Particle effects
const { 
  emitParticles,
  updateParticles 
} = useParticles(scene)

// Watch for agent state changes
watch(() => props.agents, (newAgents, oldAgents) => {
  for (const agent of newAgents) {
    const existing = getNodeByAgentId(agent.id)
    
    if (existing) {
      updateNode(agent.id, {
        status: agent.status,
        progress: agent.progress,
        currentFile: agent.currentFile,
      })
      
      // Emit particles when agent is working
      if (agent.status === 'working') {
        emitParticles(existing.position, 'work')
      }
    } else {
      createNode(agent)
    }
  }
}, { deep: true })

// Handle mouse interactions
const onMouseMove = (event: MouseEvent) => {
  const rect = containerRef.value!.getBoundingClientRect()
  const mouse = {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  }
  
  raycaster.value.setFromCamera(mouse, camera.value)
  const intersects = raycaster.value.intersectObjects(nodes.value)
  
  if (intersects.length > 0) {
    const agentId = intersects[0].object.userData.agentId
    hoveredAgent.value = props.agents.find(a => a.id === agentId) || null
    tooltipPosition.value = { x: event.clientX, y: event.clientY }
  } else {
    hoveredAgent.value = null
  }
}

// Animation loop
const animationLoop = () => {
  updateParticles()
  controls.value.update()
  renderer.value.render(scene.value, camera.value)
}

onMounted(() => {
  containerRef.value?.addEventListener('mousemove', onMouseMove)
  animate(animationLoop)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('mousemove', onMouseMove)
  dispose()
})

const formattedDuration = computed(() => {
  if (!props.run.startedAt) return '—'
  const start = new Date(props.run.startedAt)
  const end = props.run.completedAt ? new Date(props.run.completedAt) : new Date()
  const diff = Math.floor((end.getTime() - start.getTime()) / 1000)
  const mins = Math.floor(diff / 60)
  const secs = diff % 60
  return `${mins}m ${secs}s`
})
</script>
```

### 9.3 Agent Node Class

```typescript
// components/orchestrator/visualization/objects/AgentNode.ts

import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'

export interface AgentNodeOptions {
  id: string
  name: string
  role: string
  color: string
  position?: THREE.Vector3
}

export class AgentNode extends THREE.Group {
  public readonly agentId: string
  private sphere: THREE.Mesh
  private glowMesh: THREE.Mesh
  private label: CSS2DObject
  private pulseScale = 1
  private targetPulseScale = 1
  private status: string = 'idle'
  
  constructor(options: AgentNodeOptions) {
    super()
    
    this.agentId = options.id
    this.userData.agentId = options.id
    
    // Main sphere
    const geometry = new THREE.SphereGeometry(0.5, 32, 32)
    const material = new THREE.MeshStandardMaterial({
      color: options.color,
      metalness: 0.3,
      roughness: 0.7,
    })
    this.sphere = new THREE.Mesh(geometry, material)
    this.add(this.sphere)
    
    // Glow effect
    const glowGeometry = new THREE.SphereGeometry(0.6, 32, 32)
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(options.color) },
        intensity: { value: 0.5 },
      },
      vertexShader: glowVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
    this.add(this.glowMesh)
    
    // Floating label
    const labelDiv = document.createElement('div')
    labelDiv.className = 'agent-label'
    labelDiv.innerHTML = `
      <div class="name">${options.name}</div>
      <div class="status">idle</div>
    `
    this.label = new CSS2DObject(labelDiv)
    this.label.position.set(0, 0.8, 0)
    this.add(this.label)
    
    if (options.position) {
      this.position.copy(options.position)
    }
  }
  
  setStatus(status: string) {
    this.status = status
    
    // Update label
    const statusEl = this.label.element.querySelector('.status')
    if (statusEl) {
      statusEl.textContent = status
      statusEl.className = `status status-${status}`
    }
    
    // Adjust glow based on status
    const glowMaterial = this.glowMesh.material as THREE.ShaderMaterial
    
    switch (status) {
      case 'working':
        glowMaterial.uniforms.intensity.value = 1.0
        this.targetPulseScale = 1.2
        break
      case 'waiting':
        glowMaterial.uniforms.intensity.value = 0.3
        this.targetPulseScale = 1.0
        break
      case 'complete':
        glowMaterial.uniforms.intensity.value = 0.8
        glowMaterial.uniforms.color.value = new THREE.Color('#10B981')
        this.targetPulseScale = 1.0
        break
      case 'failed':
        glowMaterial.uniforms.color.value = new THREE.Color('#EF4444')
        this.targetPulseScale = 1.0
        break
      default:
        glowMaterial.uniforms.intensity.value = 0.5
        this.targetPulseScale = 1.0
    }
  }
  
  setProgress(progress: number) {
    // Could add a progress ring around the sphere
    const progressEl = this.label.element.querySelector('.progress')
    if (progressEl) {
      progressEl.textContent = `${progress}%`
    }
  }
  
  update(deltaTime: number) {
    // Smooth pulse animation
    this.pulseScale += (this.targetPulseScale - this.pulseScale) * deltaTime * 5
    
    if (this.status === 'working') {
      // Pulsing effect for working agents
      const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.1
      this.sphere.scale.setScalar(this.pulseScale * pulse)
      this.glowMesh.scale.setScalar(this.pulseScale * pulse * 1.2)
    } else {
      this.sphere.scale.setScalar(this.pulseScale)
      this.glowMesh.scale.setScalar(this.pulseScale * 1.2)
    }
  }
  
  dispose() {
    this.sphere.geometry.dispose()
    ;(this.sphere.material as THREE.Material).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.Material).dispose()
    this.label.element.remove()
  }
}

// Glow shaders
const glowVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glowFragmentShader = `
  uniform vec3 color;
  uniform float intensity;
  varying vec3 vNormal;
  
  void main() {
    float glow = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(color, glow * intensity);
  }
`
```

### 9.4 Orbital Layout

```typescript
// components/orchestrator/visualization/layouts/OrbitalLayout.ts

import * as THREE from 'three'
import type { AgentNode } from '../objects/AgentNode'

export class OrbitalLayout {
  private center = new THREE.Vector3(0, 0, 0)
  private radius = 5
  private rotationSpeed = 0.001
  
  constructor(options?: { radius?: number; rotationSpeed?: number }) {
    if (options?.radius) this.radius = options.radius
    if (options?.rotationSpeed) this.rotationSpeed = options.rotationSpeed
  }
  
  positionNodes(nodes: AgentNode[]): void {
    const count = nodes.length
    
    nodes.forEach((node, index) => {
      const angle = (index / count) * Math.PI * 2
      const x = Math.cos(angle) * this.radius
      const z = Math.sin(angle) * this.radius
      
      // Animate to position
      this.animateToPosition(node, new THREE.Vector3(x, 0, z))
    })
  }
  
  update(nodes: AgentNode[], deltaTime: number): void {
    // Optional: slowly rotate all nodes around center
    nodes.forEach((node, index) => {
      if (node.userData.status !== 'working') return
      
      const currentAngle = Math.atan2(node.position.z, node.position.x)
      const newAngle = currentAngle + this.rotationSpeed * deltaTime
      
      node.position.x = Math.cos(newAngle) * this.radius
      node.position.z = Math.sin(newAngle) * this.radius
    })
  }
  
  private animateToPosition(node: AgentNode, target: THREE.Vector3): void {
    // Use GSAP or manual interpolation
    const duration = 1000
    const start = node.position.clone()
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = this.easeOutCubic(progress)
      
      node.position.lerpVectors(start, target, eased)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    animate()
  }
  
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
}
```

---

## 10. MCP Bridge

### 10.1 MCP Server Setup

```typescript
// mcp-bridge/src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { OrchestratorBridge } from './orchestrator-bridge'
import { RAGBridge } from './rag-bridge'

const server = new Server(
  {
    name: 'conductor-orchestrator',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
)

const orchestrator = new OrchestratorBridge()
const rag = new RAGBridge()

// Register orchestrator tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'orchestrator_status',
      description: 'Get current run status and agent states',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
        },
        required: ['runId'],
      },
    },
    {
      name: 'orchestrator_log',
      description: 'Log a message or decision from the agent',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['action', 'decision', 'progress', 'error'] 
          },
          content: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['type', 'content'],
      },
    },
    {
      name: 'orchestrator_artifact',
      description: 'Record an artifact created by the agent',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['type', 'name'],
      },
    },
    {
      name: 'rag_query',
      description: 'Query the RAG system for relevant context',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          filters: { type: 'object' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
    {
      name: 'rag_multi_hop',
      description: 'Perform multi-hop RAG query for complex context retrieval',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          hops: { type: 'number' },
          filters: { type: 'object' },
        },
        required: ['query'],
      },
    },
    {
      name: 'rag_ingest',
      description: 'Store content in RAG for future retrieval',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          metadata: { type: 'object' },
          extractEntities: { type: 'boolean' },
        },
        required: ['content'],
      },
    },
  ],
}))

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'orchestrator_status':
      return orchestrator.getStatus(args.runId)
    
    case 'orchestrator_log':
      return orchestrator.log(args.type, args.content, args.metadata)
    
    case 'orchestrator_artifact':
      return orchestrator.recordArtifact(args)
    
    case 'rag_query':
      return rag.query(args.query, args.filters, args.limit)
    
    case 'rag_multi_hop':
      return rag.multiHopQuery(args.query, args.hops, args.filters)
    
    case 'rag_ingest':
      return rag.ingest(args.content, args.metadata, args.extractEntities)
    
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

// Start server
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 10.2 Orchestrator Bridge

```typescript
// mcp-bridge/src/orchestrator-bridge.ts

import { WebSocket } from 'ws'

export class OrchestratorBridge {
  private ws: WebSocket | null = null
  private runId: string | null = null
  private agentInstanceId: string | null = null
  
  constructor() {
    this.connect()
  }
  
  private connect() {
    const wsUrl = process.env.ORCHESTRATOR_WS_URL || 'ws://localhost:8080'
    this.ws = new WebSocket(wsUrl)
    
    this.ws.on('open', () => {
      console.log('Connected to orchestrator')
      
      // Register this agent session
      if (this.runId && this.agentInstanceId) {
        this.send('agent.register', {
          runId: this.runId,
          agentInstanceId: this.agentInstanceId,
        })
      }
    })
    
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString())
      this.handleMessage(message)
    })
    
    this.ws.on('close', () => {
      console.log('Disconnected from orchestrator, reconnecting...')
      setTimeout(() => this.connect(), 1000)
    })
  }
  
  setContext(runId: string, agentInstanceId: string) {
    this.runId = runId
    this.agentInstanceId = agentInstanceId
  }
  
  async getStatus(runId: string): Promise<any> {
    return this.request('run.getState', { runId })
  }
  
  async log(type: string, content: string, metadata?: any): Promise<void> {
    this.send('agent.log', {
      runId: this.runId,
      agentInstanceId: this.agentInstanceId,
      type,
      content,
      metadata,
    })
  }
  
  async recordArtifact(artifact: any): Promise<void> {
    this.send('agent.artifact', {
      runId: this.runId,
      agentInstanceId: this.agentInstanceId,
      ...artifact,
    })
  }
  
  async updateProgress(progress: number): Promise<void> {
    this.send('agent.progress', {
      runId: this.runId,
      agentInstanceId: this.agentInstanceId,
      progress,
    })
  }
  
  private send(event: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }))
    }
  }
  
  private async request(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2)
      
      const handler = (message: any) => {
        if (message.id === id) {
          this.ws?.off('message', handler)
          if (message.error) {
            reject(new Error(message.error))
          } else {
            resolve(message.data)
          }
        }
      }
      
      this.ws?.on('message', (raw) => handler(JSON.parse(raw.toString())))
      this.send(event, { ...data, id })
      
      setTimeout(() => reject(new Error('Request timeout')), 10000)
    })
  }
  
  private handleMessage(message: any) {
    switch (message.event) {
      case 'run.pause':
        // Handle pause request
        break
      case 'run.cancel':
        // Handle cancel request
        process.exit(0)
        break
    }
  }
}
```

---

## 11. Dashboard UI

### 11.1 Page Structure

```
pages/orchestrator/
├── index.vue                    # Dashboard overview
├── agents/
│   ├── index.vue                # Agent list
│   └── [id].vue                 # Agent editor
├── rules/
│   ├── index.vue                # Rules list
│   └── [id].vue                 # Rules editor
├── workspaces/
│   ├── index.vue                # Workspace list
│   └── [id].vue                 # Workspace settings
├── runs/
│   ├── index.vue                # Run history
│   ├── new.vue                  # Create new run
│   └── [id].vue                 # Run detail/monitor
└── settings/
    ├── index.vue                # General settings
    └── linear.vue               # Linear integration
```

### 11.2 Agent Editor Component

```vue
<!-- pages/orchestrator/agents/[id].vue -->
<template>
  <div class="max-w-4xl mx-auto py-8 px-4">
    <Breadcrumb :items="breadcrumbs" />
    
    <div class="mt-6">
      <h1 class="text-2xl font-bold">
        {{ isNew ? 'Create Agent' : 'Edit Agent' }}
      </h1>
    </div>
    
    <form @submit.prevent="save" class="mt-8 space-y-8">
      <!-- Basic Info -->
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <FormField label="Name" required>
            <Input v-model="form.name" placeholder="Backend Developer" />
          </FormField>
          
          <FormField label="Role" required>
            <Select v-model="form.role">
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem 
                  v-for="role in roles" 
                  :key="role.value" 
                  :value="role.value"
                >
                  {{ role.icon }} {{ role.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          
          <FormField label="Color">
            <div class="flex items-center gap-3">
              <input 
                type="color" 
                v-model="form.color"
                class="w-12 h-10 rounded cursor-pointer"
              />
              <Input v-model="form.color" class="w-28 font-mono" />
            </div>
          </FormField>
          
          <FormField label="Description">
            <Textarea 
              v-model="form.description" 
              placeholder="What does this agent do?"
              rows="3"
            />
          </FormField>
        </CardContent>
      </Card>
      
      <!-- System Prompt -->
      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            The base instructions given to this agent for every task.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea 
            v-model="form.systemPrompt" 
            placeholder="You are a backend developer..."
            rows="10"
            class="font-mono text-sm"
          />
        </CardContent>
      </Card>
      
      <!-- Rules -->
      <Card>
        <CardHeader>
          <CardTitle>Rules & Constraints</CardTitle>
          <CardDescription>
            Specific rules this agent must follow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div 
              v-for="(rule, index) in form.rules" 
              :key="index"
              class="flex items-center gap-2"
            >
              <Input v-model="form.rules[index]" class="flex-1" />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon"
                @click="removeRule(index)"
              >
                <TrashIcon class="w-4 h-4" />
              </Button>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              @click="addRule"
            >
              <PlusIcon class="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <!-- MCP Tools -->
      <Card>
        <CardHeader>
          <CardTitle>Tool Access</CardTitle>
          <CardDescription>
            Which MCP tools this agent can use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-4">
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
              <Checkbox v-model="form.mcpTools.rag" />
              <div>
                <p class="font-medium">RAG System</p>
                <p class="text-sm text-gray-500">Query and store in memory</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
              <Checkbox v-model="form.mcpTools.filesystem" />
              <div>
                <p class="font-medium">Filesystem</p>
                <p class="text-sm text-gray-500">Read and write files</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
              <Checkbox v-model="form.mcpTools.git" />
              <div>
                <p class="font-medium">Git</p>
                <p class="text-sm text-gray-500">Version control operations</p>
              </div>
            </label>
            
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
              <Checkbox v-model="form.mcpTools.terminal" />
              <div>
                <p class="font-medium">Terminal</p>
                <p class="text-sm text-gray-500">Execute commands</p>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>
      
      <!-- Context Files -->
      <Card>
        <CardHeader>
          <CardTitle>Context Files</CardTitle>
          <CardDescription>
            Files to always include in this agent's context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <div 
              v-for="(file, index) in form.contextFiles" 
              :key="index"
              class="flex items-center gap-2"
            >
              <Input 
                v-model="form.contextFiles[index]" 
                placeholder="/docs/api-standards.md"
                class="flex-1 font-mono text-sm" 
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon"
                @click="removeContextFile(index)"
              >
                <TrashIcon class="w-4 h-4" />
              </Button>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              @click="addContextFile"
            >
              <PlusIcon class="w-4 h-4 mr-2" />
              Add File
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <!-- Actions -->
      <div class="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" @click="$router.back()">
          Cancel
        </Button>
        <Button type="submit" :loading="saving">
          {{ isNew ? 'Create Agent' : 'Save Changes' }}
        </Button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.params.id === 'new')
const saving = ref(false)

const roles = [
  { value: 'architect', label: 'Architect', icon: '🏗️' },
  { value: 'backend', label: 'Backend Developer', icon: '⚙️' },
  { value: 'frontend', label: 'Frontend Developer', icon: '🎨' },
  { value: 'tester', label: 'Tester', icon: '🧪' },
  { value: 'reviewer', label: 'Code Reviewer', icon: '👀' },
  { value: 'docs', label: 'Documentation', icon: '📝' },
]

const form = ref({
  name: '',
  role: '',
  color: '#3B82F6',
  description: '',
  systemPrompt: '',
  rules: [''],
  contextFiles: [],
  mcpTools: {
    rag: true,
    filesystem: true,
    git: true,
    terminal: false,
  },
  canSpawnSubAgents: false,
  maxConcurrentTasks: 1,
  dependencies: [],
})

const addRule = () => form.value.rules.push('')
const removeRule = (index: number) => form.value.rules.splice(index, 1)
const addContextFile = () => form.value.contextFiles.push('')
const removeContextFile = (index: number) => form.value.contextFiles.splice(index, 1)

const save = async () => {
  saving.value = true
  
  try {
    const data = {
      ...form.value,
      rules: form.value.rules.filter(r => r.trim()),
      contextFiles: form.value.contextFiles.filter(f => f.trim()),
    }
    
    if (isNew.value) {
      await $fetch('/api/orchestrator/agents', {
        method: 'POST',
        body: data,
      })
    } else {
      await $fetch(`/api/orchestrator/agents/${route.params.id}`, {
        method: 'PUT',
        body: data,
      })
    }
    
    router.push('/orchestrator/agents')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!isNew.value) {
    const agent = await $fetch(`/api/orchestrator/agents/${route.params.id}`)
    Object.assign(form.value, agent)
  }
})
</script>
```

### 11.3 Run Monitor Page

```vue
<!-- pages/orchestrator/runs/[id].vue -->
<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b px-6 py-4 flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-semibold">{{ run?.name }}</h1>
          <StatusBadge :status="run?.status" />
          <span 
            v-if="run?.linearIdentifier"
            class="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm font-mono"
          >
            {{ run.linearIdentifier }}
          </span>
        </div>
        <p class="text-sm text-gray-500 mt-1">
          Started {{ formatRelativeTime(run?.startedAt) }}
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <Button 
          v-if="run?.status === 'running'"
          variant="outline"
          @click="pauseRun"
        >
          <PauseIcon class="w-4 h-4 mr-2" />
          Pause
        </Button>
        <Button 
          v-if="run?.status === 'paused'"
          variant="outline"
          @click="resumeRun"
        >
          <PlayIcon class="w-4 h-4 mr-2" />
          Resume
        </Button>
        <Button 
          v-if="['running', 'paused'].includes(run?.status)"
          variant="destructive"
          @click="cancelRun"
        >
          <StopIcon class="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </header>
    
    <!-- Main content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left sidebar: Agent list -->
      <aside class="w-64 border-r overflow-y-auto">
        <div class="p-4">
          <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Agents
          </h2>
        </div>
        
        <div class="space-y-1 px-2">
          <button
            v-for="instance in agentInstances"
            :key="instance.id"
            @click="selectedAgent = instance.id"
            class="w-full p-3 rounded-lg text-left transition-colors"
            :class="selectedAgent === instance.id 
              ? 'bg-gray-100' 
              : 'hover:bg-gray-50'"
          >
            <div class="flex items-center gap-3">
              <div 
                class="w-3 h-3 rounded-full"
                :style="{ backgroundColor: instance.agent.color }"
              />
              <span class="font-medium">{{ instance.agent.name }}</span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <AgentStatusIcon :status="instance.status" />
              <span class="text-sm text-gray-500">{{ instance.status }}</span>
            </div>
            <div v-if="instance.status === 'working'" class="mt-2">
              <ProgressBar :value="instance.progress" />
            </div>
          </button>
        </div>
      </aside>
      
      <!-- Center: Visualization -->
      <main class="flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 relative">
          <AgentVisualization
            :run="run"
            :agents="agentStates"
            :metrics="metrics"
          />
        </div>
        
        <!-- Bottom: Tabs -->
        <div class="h-80 border-t flex flex-col">
          <Tabs v-model="activeTab" class="flex-1 flex flex-col">
            <TabsList class="px-4 border-b">
              <TabsTrigger value="logs">Activity Log</TabsTrigger>
              <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
              <TabsTrigger value="decisions">Decisions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="logs" class="flex-1 overflow-hidden">
              <ActivityLog :messages="messages" :autoScroll="true" />
            </TabsContent>
            
            <TabsContent value="artifacts" class="flex-1 overflow-y-auto p-4">
              <ArtifactList :artifacts="artifacts" />
            </TabsContent>
            
            <TabsContent value="decisions" class="flex-1 overflow-y-auto p-4">
              <DecisionList :decisions="decisions" />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <!-- Right sidebar: Metrics -->
      <aside class="w-72 border-l overflow-y-auto">
        <div class="p-4 space-y-6">
          <MetricsPanel :metrics="metrics" />
          
          <div v-if="run?.linearIdentifier">
            <h3 class="text-sm font-medium text-gray-500 mb-2">Linear</h3>
            <a 
              :href="linearUrl"
              target="_blank"
              class="flex items-center gap-2 text-indigo-600 hover:underline"
            >
              <ExternalLinkIcon class="w-4 h-4" />
              View in Linear
            </a>
          </div>
          
          <div v-if="run?.pullRequestUrl">
            <h3 class="text-sm font-medium text-gray-500 mb-2">Pull Request</h3>
            <a 
              :href="run.pullRequestUrl"
              target="_blank"
              class="flex items-center gap-2 text-green-600 hover:underline"
            >
              <GitPullRequestIcon class="w-4 h-4" />
              View PR
            </a>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useWebSocket } from '~/composables/useWebSocket'

const route = useRoute()
const runId = computed(() => route.params.id as string)

const run = ref(null)
const agentInstances = ref([])
const messages = ref([])
const artifacts = ref([])
const decisions = ref([])
const selectedAgent = ref(null)
const activeTab = ref('logs')

const metrics = computed(() => run.value?.metrics ?? {
  totalTokens: 0,
  filesModified: 0,
  testsRun: 0,
  ragQueries: 0,
  ragInserts: 0,
})

const agentStates = computed(() => 
  agentInstances.value.map(i => ({
    id: i.agent.id,
    instanceId: i.id,
    name: i.agent.name,
    role: i.agent.role,
    color: i.agent.color,
    status: i.status,
    progress: i.progress,
    currentFile: i.currentFile,
  }))
)

// WebSocket connection for real-time updates
const { subscribe, unsubscribe } = useWebSocket()

onMounted(async () => {
  // Load initial data
  run.value = await $fetch(`/api/orchestrator/runs/${runId.value}`)
  agentInstances.value = run.value.agentInstances
  messages.value = await $fetch(`/api/orchestrator/runs/${runId.value}/messages`)
  artifacts.value = await $fetch(`/api/orchestrator/runs/${runId.value}/artifacts`)
  decisions.value = await $fetch(`/api/orchestrator/runs/${runId.value}/decisions`)
  
  // Subscribe to real-time updates
  subscribe(`run.${runId.value}`, {
    'run.status': (data) => {
      run.value.status = data.status
      run.value.metrics = data.metrics
    },
    'agent.status': (data) => {
      const instance = agentInstances.value.find(i => i.id === data.agentInstanceId)
      if (instance) {
        instance.status = data.status
        instance.progress = data.progress
        instance.currentFile = data.currentFile
      }
    },
    'run.message': (data) => {
      messages.value.push(data.message)
    },
    'run.artifact': (data) => {
      artifacts.value.push(data.artifact)
    },
  })
})

onUnmounted(() => {
  unsubscribe(`run.${runId.value}`)
})

const pauseRun = async () => {
  await $fetch(`/api/orchestrator/runs/${runId.value}/pause`, { method: 'POST' })
}

const resumeRun = async () => {
  await $fetch(`/api/orchestrator/runs/${runId.value}/resume`, { method: 'POST' })
}

const cancelRun = async () => {
  if (confirm('Are you sure you want to cancel this run?')) {
    await $fetch(`/api/orchestrator/runs/${runId.value}/cancel`, { method: 'POST' })
  }
}
</script>
```

---

## 12. File Structure

```
conductor/
├── app/
│   ├── Console/
│   │   └── Commands/
│   │       └── Orchestrator/
│   │           ├── StartRunCommand.php
│   │           └── CleanupRunsCommand.php
│   ├── Events/
│   │   └── Orchestrator/
│   │       ├── RunStarted.php
│   │       ├── RunCompleted.php
│   │       ├── RunFailed.php
│   │       ├── AgentStatusChanged.php
│   │       └── ArtifactCreated.php
│   ├── Http/
│   │   └── Controllers/
│   │       └── Orchestrator/
│   │           ├── AgentController.php
│   │           ├── RulesController.php
│   │           ├── WorkspaceController.php
│   │           ├── RunController.php
│   │           ├── ConfigController.php
│   │           └── LinearWebhookController.php
│   ├── Jobs/
│   │   └── Orchestrator/
│   │       ├── ExecuteAgentJob.php
│   │       ├── SyncLinearJob.php
│   │       └── IngestToRAGJob.php
│   ├── Listeners/
│   │   └── Orchestrator/
│   │       ├── NotifyLinearOnRunComplete.php
│   │       └── BroadcastRunState.php
│   ├── Models/
│   │   └── Orchestrator/
│   │       ├── Agent.php
│   │       ├── Rules.php
│   │       ├── Workspace.php
│   │       ├── RunConfig.php
│   │       ├── Run.php
│   │       ├── AgentInstance.php
│   │       ├── Message.php
│   │       ├── Artifact.php
│   │       ├── Decision.php
│   │       └── LinearConfig.php
│   └── Services/
│       └── Orchestrator/
│           ├── OrchestratorEngine.php
│           ├── RunStateManager.php
│           ├── ContextBuilder.php
│           ├── MCPBridge.php
│           ├── RAGService.php
│           ├── LinearSyncService.php
│           └── LinearLabelSetup.php
├── config/
│   └── orchestrator.php
├── database/
│   └── migrations/
│       └── orchestrator/
│           ├── 2026_01_01_000001_create_workspaces_table.php
│           ├── 2026_01_01_000002_create_agents_table.php
│           ├── 2026_01_01_000003_create_rules_table.php
│           ├── 2026_01_01_000004_create_run_configs_table.php
│           ├── 2026_01_01_000005_create_runs_table.php
│           ├── 2026_01_01_000006_create_agent_instances_table.php
│           ├── 2026_01_01_000007_create_messages_table.php
│           ├── 2026_01_01_000008_create_artifacts_table.php
│           ├── 2026_01_01_000009_create_decisions_table.php
│           ├── 2026_01_01_000010_create_linear_configs_table.php
│           └── 2026_01_01_000011_create_rag_namespaces_table.php
├── mcp-bridge/
│   ├── src/
│   │   ├── index.ts
│   │   ├── orchestrator-bridge.ts
│   │   ├── rag-bridge.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
├── resources/
│   └── views/
│       └── orchestrator/
│           └── prompts/
│               └── agent.blade.php
└── frontend/
    ├── components/
    │   └── orchestrator/
    │       ├── AgentCard.vue
    │       ├── AgentSelector.vue
    │       ├── RulesSelector.vue
    │       ├── WorkspaceSelector.vue
    │       ├── RunCard.vue
    │       ├── StatusBadge.vue
    │       ├── ProgressBar.vue
    │       ├── MetricsPanel.vue
    │       ├── ActivityLog.vue
    │       ├── ArtifactList.vue
    │       ├── DecisionList.vue
    │       └── visualization/
    │           ├── AgentVisualization.vue
    │           ├── composables/
    │           │   ├── useThreeScene.ts
    │           │   ├── useAgentNodes.ts
    │           │   ├── useConnections.ts
    │           │   ├── useParticles.ts
    │           │   └── useLabels.ts
    │           ├── objects/
    │           │   ├── TaskNode.ts
    │           │   ├── AgentNode.ts
    │           │   ├── ConnectionLine.ts
    │           │   ├── ParticleSystem.ts
    │           │   └── FloatingLabel.ts
    │           └── layouts/
    │               ├── OrbitalLayout.ts
    │               ├── NetworkLayout.ts
    │               └── TimelineLayout.ts
    ├── pages/
    │   └── orchestrator/
    │       ├── index.vue
    │       ├── agents/
    │       │   ├── index.vue
    │       │   └── [id].vue
    │       ├── rules/
    │       │   ├── index.vue
    │       │   └── [id].vue
    │       ├── workspaces/
    │       │   ├── index.vue
    │       │   └── [id].vue
    │       ├── runs/
    │       │   ├── index.vue
    │       │   ├── new.vue
    │       │   └── [id].vue
    │       └── settings/
    │           ├── index.vue
    │           └── linear.vue
    ├── composables/
    │   ├── useOrchestrator.ts
    │   └── useWebSocket.ts
    ├── stores/
    │   └── orchestrator.ts
    └── types/
        └── orchestrator.ts
```

---

## 13. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goals:** Core infrastructure and basic agent management

**Tasks:**
- [ ] Database migrations for all core tables
- [ ] Agent CRUD API and UI
- [ ] Workspace CRUD API and UI
- [ ] Orchestration Rules CRUD API and UI
- [ ] Basic configuration schema validation
- [ ] Unit tests for models and services

**Deliverables:**
- Working agent configuration interface
- Database schema implemented
- Basic API endpoints

---

### Phase 2: Orchestration Engine (Weeks 3-4)

**Goals:** Core execution engine and MCP integration

**Tasks:**
- [ ] OrchestratorEngine implementation
- [ ] RunStateManager for tracking
- [ ] MCP Bridge server setup
- [ ] Sequential execution pattern
- [ ] Basic agent prompt building
- [ ] Run creation and management API
- [ ] WebSocket server setup (Laravel Reverb)
- [ ] Real-time state broadcasting

**Deliverables:**
- Functional orchestration engine
- Sequential run execution working
- Real-time updates via WebSocket

---

### Phase 3: RAG Integration (Weeks 5-6)

**Goals:** Full RAG system integration for agent context

**Tasks:**
- [ ] RAGService implementation
- [ ] ContextBuilder for agent prompts
- [ ] Agent output ingestion
- [ ] Decision tracking and storage
- [ ] Multi-hop query integration
- [ ] Temporal decay configuration
- [ ] Entity extraction integration
- [ ] Prior run context querying

**Deliverables:**
- Agents can query RAG
- Agent outputs stored in RAG
- Cross-agent context sharing working

---

### Phase 4: Parallel Execution (Weeks 7-8)

**Goals:** Parallel agent execution and Git worktree support

**Tasks:**
- [ ] Parallel execution pattern
- [ ] Git worktree management
- [ ] Dependency-based scheduling
- [ ] Pipeline execution pattern
- [ ] Swarm execution pattern
- [ ] Batch job processing with Horizon
- [ ] Conflict detection and resolution

**Deliverables:**
- Multiple agents running in parallel
- Git worktree isolation working
- All execution patterns functional

---

### Phase 5: Linear Integration (Weeks 9-10)

**Goals:** Bidirectional Linear sync

**Tasks:**
- [ ] Linear API client
- [ ] Webhook receiver
- [ ] Issue → Run mapping
- [ ] Run → Issue updates
- [ ] Sub-issue creation
- [ ] Comment posting
- [ ] Label management
- [ ] Status sync
- [ ] Linear configuration UI

**Deliverables:**
- Issues trigger runs automatically
- Run status syncs to Linear
- Full bidirectional integration

---

### Phase 6: Visualization (Weeks 11-12)

**Goals:** Three.js real-time visualization

**Tasks:**
- [ ] Three.js scene setup
- [ ] Agent node rendering
- [ ] Connection lines
- [ ] Particle effects
- [ ] Floating labels
- [ ] Orbital layout
- [ ] Network layout
- [ ] Timeline layout
- [ ] Interaction (hover, click)
- [ ] Performance optimization

**Deliverables:**
- Working 3D visualization
- Real-time agent status updates
- Multiple view modes

---

### Phase 7: Dashboard & Polish (Weeks 13-14)

**Goals:** Complete UI and production readiness

**Tasks:**
- [ ] Dashboard overview page
- [ ] Run history with filtering
- [ ] Run detail/monitor page
- [ ] Settings pages
- [ ] Error handling and recovery
- [ ] Logging and debugging tools
- [ ] Performance optimization
- [ ] Documentation
- [ ] End-to-end tests

**Deliverables:**
- Complete, polished UI
- Production-ready system
- Full documentation

---

## 14. Testing Strategy

### 14.1 Unit Tests

```php
// tests/Unit/Orchestrator/OrchestratorEngineTest.php

class OrchestratorEngineTest extends TestCase
{
    public function test_creates_agent_instances_on_run_start(): void
    {
        $run = Run::factory()
            ->withAgents(3)
            ->create();
        
        $engine = app(OrchestratorEngine::class);
        $engine->startRun($run);
        
        $this->assertCount(3, $run->agentInstances);
        $this->assertEquals('running', $run->fresh()->status);
    }
    
    public function test_executes_agents_sequentially(): void
    {
        $run = Run::factory()
            ->withAgents(2)
            ->withRules(['pattern' => 'sequential'])
            ->create();
        
        $engine = app(OrchestratorEngine::class);
        $engine->startRun($run);
        
        // First agent should complete before second starts
        $instances = $run->agentInstances()->orderBy('started_at')->get();
        
        $this->assertTrue(
            $instances[0]->completed_at < $instances[1]->started_at
        );
    }
}
```

### 14.2 Integration Tests

```php
// tests/Integration/Orchestrator/LinearIntegrationTest.php

class LinearIntegrationTest extends TestCase
{
    public function test_creates_run_from_linear_webhook(): void
    {
        $config = LinearConfig::factory()->create([
            'auto_trigger_on_label' => true,
        ]);
        
        $payload = $this->getLinearWebhookPayload([
            'action' => 'update',
            'data' => [
                'id' => 'issue-123',
                'title' => 'Implement feature X',
                'description' => 'Details here...',
                'team' => ['id' => $config->team_id],
                'labels' => [['id' => $config->trigger_label_id]],
                'state' => ['type' => 'started'],
            ],
        ]);
        
        $this->postJson('/api/orchestrator/linear/webhook', $payload)
            ->assertOk();
        
        $this->assertDatabaseHas('orchestrator_runs', [
            'linear_issue_id' => 'issue-123',
            'status' => 'running',
        ]);
    }
}
```

### 14.3 E2E Tests

```typescript
// tests/e2e/orchestrator/create-run.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Create Run', () => {
  test('creates and monitors a run', async ({ page }) => {
    await page.goto('/orchestrator/runs/new')
    
    // Fill form
    await page.fill('[data-testid="run-name"]', 'Test Run')
    await page.fill('[data-testid="run-prompt"]', 'Implement hello world')
    await page.click('[data-testid="workspace-select"]')
    await page.click('text=Test Workspace')
    
    // Select agents
    await page.click('[data-testid="agent-backend"]')
    await page.click('[data-testid="agent-tester"]')
    
    // Start run
    await page.click('[data-testid="start-run"]')
    
    // Should navigate to run detail
    await expect(page).toHaveURL(/\/orchestrator\/runs\/[\w-]+/)
    
    // Should show running status
    await expect(page.locator('[data-testid="run-status"]')).toHaveText('running')
    
    // Should show agents
    await expect(page.locator('[data-testid="agent-instance"]')).toHaveCount(2)
  })
})
```

---

## 15. Security Considerations

### 15.1 Input Validation

- Sanitize all user inputs (prompts, rules, file paths)
- Validate file paths to prevent directory traversal
- Limit prompt and rule lengths
- Validate MCP tool configurations

### 15.2 Execution Sandboxing

- Agents run in isolated Git worktrees
- Terminal access requires explicit enable
- Command allowlist for terminal execution
- Network access restrictions where needed

### 15.3 Linear Integration

- Verify webhook signatures
- Store API tokens encrypted
- Scope tokens to minimum required permissions
- Audit log for all Linear operations

### 15.4 Data Protection

- Encrypt sensitive configuration data
- Secure WebSocket connections (WSS)
- Rate limiting on all APIs
- Audit logging for administrative actions

---

## 16. Performance Optimization

### 16.1 Database

- Index all foreign keys and frequently queried columns
- Partition messages table by run_id
- Archive completed runs older than 30 days
- Use connection pooling

### 16.2 Real-time Updates

- Batch WebSocket broadcasts
- Throttle high-frequency updates (progress)
- Use Redis pub/sub for horizontal scaling
- Implement client-side debouncing

### 16.3 RAG Queries

- Cache frequent queries
- Use async ingestion jobs
- Batch entity extraction
- Implement query timeout limits

### 16.4 Visualization

- Use instanced rendering for particles
- Implement level-of-detail for distant nodes
- Throttle animation frame rate when tab hidden
- Use Web Workers for layout calculations

---

## 17. Future Enhancements

### 17.1 Short-term (v1.1)

- GitHub Actions integration for CI/CD triggers
- Slack notifications
- Custom MCP tool definitions
- Run templates marketplace
- Agent performance analytics

### 17.2 Medium-term (v1.5)

- Multi-repository orchestration
- Agent learning from corrections
- A/B testing for agent prompts
- Cost tracking and budgeting
- Team collaboration features

### 17.3 Long-term (v2.0)

- Self-improving agents
- Natural language run configuration
- Visual workflow builder
- Plugin architecture
- Multi-LLM support

---

## Appendix A: Configuration Reference

### orchestrator.php

```php
<?php

return [
    'mcp' => [
        'host' => env('MCP_HOST', 'localhost'),
        'port' => env('MCP_PORT', 3100),
        'timeout' => env('MCP_TIMEOUT', 30),
    ],
    
    'linear' => [
        'api_key' => env('LINEAR_API_KEY'),
        'webhook_secret' => env('LINEAR_WEBHOOK_SECRET'),
    ],
    
    'rag' => [
        'default_namespace' => env('RAG_DEFAULT_NAMESPACE', 'default'),
        'embedding_model' => env('RAG_EMBEDDING_MODEL', 'text-embedding-3-small'),
        'chunk_size' => env('RAG_CHUNK_SIZE', 1024),
        'temporal_decay' => env('RAG_TEMPORAL_DECAY', 0.1),
    ],
    
    'runs' => [
        'max_concurrent' => env('ORCHESTRATOR_MAX_CONCURRENT_RUNS', 5),
        'max_duration' => env('ORCHESTRATOR_MAX_DURATION', 3600),
        'cleanup_after_days' => env('ORCHESTRATOR_CLEANUP_DAYS', 30),
    ],
    
    'agents' => [
        'default_timeout' => env('AGENT_DEFAULT_TIMEOUT', 600),
        'max_retries' => env('AGENT_MAX_RETRIES', 3),
    ],
];
```

---

## Appendix B: Agent Prompt Template

```blade
{{-- resources/views/orchestrator/prompts/agent.blade.php --}}

# Agent: {{ $agent->name }}
Role: {{ $agent->role }}

## System Instructions
{{ $agent->systemPrompt }}

## Current Task
{{ $run->prompt }}

## Context from RAG
@if(count($context['ragChunks']) > 0)
@foreach($context['ragChunks'] as $chunk)
### {{ $chunk['metadata']['source'] ?? 'Unknown Source' }}
{{ $chunk['content'] }}

@endforeach
@else
No relevant context found in RAG.
@endif

## Work Completed by Other Agents
@if(count($context['completedOutputs']) > 0)
@foreach($context['completedOutputs'] as $output)
### {{ $output['agent'] }} ({{ $output['role'] }})
**Artifacts:**
@foreach($output['artifacts'] as $artifact)
- {{ $artifact['type'] }}: {{ $artifact['path'] }}
@endforeach

**Decisions:**
@foreach($output['decisions'] as $decision)
- {{ $decision['category'] }}: {{ $decision['summary'] }}
@endforeach

@endforeach
@else
You are the first agent to work on this task.
@endif

## Rules
@foreach($globalRules as $rule)
- {{ $rule }}
@endforeach
@foreach($agent->rules as $rule)
- {{ $rule }}
@endforeach

## Available Tools
You have access to the following MCP tools:
@if($agent->mcp_tools['rag'])
- **rag_query**: Search for relevant context
- **rag_multi_hop**: Perform multi-hop reasoning queries
- **rag_ingest**: Store important decisions and context
@endif
@if($agent->mcp_tools['filesystem'])
- **filesystem**: Read and write files
@endif
@if($agent->mcp_tools['git'])
- **git**: Version control operations
@endif
@if($agent->mcp_tools['terminal'])
- **terminal**: Execute shell commands (use carefully)
@endif

## Instructions
1. Analyze the task and available context
2. Plan your approach
3. Execute your work, using tools as needed
4. Record important decisions using rag_ingest
5. Report your progress and any blockers

Begin your work now.
```

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: Claude (Anthropic)*
