export const SAMPLE_MARKDOWN_DOC = `# Getting Started with TypeScript

## Introduction

TypeScript is a strongly typed programming language that builds on JavaScript.

## Installation

\`\`\`bash
npm install -g typescript
\`\`\`

## Basic Types

TypeScript supports all JavaScript primitives plus additional types:

\`\`\`typescript
let isDone: boolean = false;
let decimal: number = 6;
let color: string = "blue";
let list: number[] = [1, 2, 3];
\`\`\`

## Functions

Functions can have typed parameters and return types:

\`\`\`typescript
function add(x: number, y: number): number {
  return x + y;
}
\`\`\`
`;

export const SAMPLE_CODE_DOC = `
import { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
}

export function useUser(userId: number): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function fetchUser() {
      const response = await fetch(\`/api/users/\${userId}\`);
      const data = await response.json();
      setUser(data);
    }
    fetchUser();
  }, [userId]);

  return user;
}
`;

export const SAMPLE_ERROR_DOC = `
Error: Cannot find module 'react'
  at Function.Module._resolveFilename (node:internal/modules/cjs/loader:933:15)
  at Function.Module._load (node:internal/modules/cjs/loader:778:27)
  at Module.require (node:internal/modules/cjs/loader:1005:19)
  at require (node:internal/modules/cjs/helpers:102:18)

Solution: Run npm install react in your project directory.
`;

export const SAMPLE_CONFIG_DOC = `
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
`;

export const SAMPLE_API_DOC = `# REST API Reference

## Authentication

All API requests require a Bearer token in the Authorization header.

### Endpoints

#### GET /api/users
Returns a list of all users.

**Response:**
\`\`\`json
{
  "users": [
    {"id": 1, "name": "John", "email": "john@example.com"}
  ]
}
\`\`\`

#### POST /api/users
Creates a new user.

**Request Body:**
\`\`\`json
{
  "name": "Jane",
  "email": "jane@example.com"
}
\`\`\`

#### DELETE /api/users/:id
Deletes a user by ID.

**Response:** 204 No Content
`;

export const SAMPLE_MIXED_DOC = `
# Database Migration Guide

## Overview
This guide covers migrating from PostgreSQL 13 to 14.

## Pre-Migration Steps

1. Backup your database:
\`\`\`sql
pg_dump -U postgres -d mydb > backup.sql
\`\`\`

2. Check for deprecated features:
\`\`\`bash
grep -r "VACUUM FULL" ./queries/
\`\`\`

## Code Changes Required

Update your connection string:
\`\`\`typescript
const connectionString = process.env.DATABASE_URL || 
  'postgresql://user:pass@localhost:5432/mydb?sslmode=require';
\`\`\`

## Post-Migration Verification

Run the following queries to verify:
\`\`\`sql
SELECT version();
SELECT pg_catalog.pg_is_in_recovery();
\`\`\`
`;

export const DOCUMENTS = {
  markdown: SAMPLE_MARKDOWN_DOC,
  code: SAMPLE_CODE_DOC,
  error: SAMPLE_ERROR_DOC,
  config: SAMPLE_CONFIG_DOC,
  api: SAMPLE_API_DOC,
  mixed: SAMPLE_MIXED_DOC,
};
