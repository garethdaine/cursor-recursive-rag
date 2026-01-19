import type { Conversation, ConversationMessage } from '../factories/conversation.js';

export const DEBUG_SESSION_CONVERSATION: Conversation = {
  id: 'conv-debug-session',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T10:30:00Z'),
  messages: [
    { role: 'user', content: 'I\'m getting "TypeError: Cannot read property \'map\' of undefined" in my React component' },
    { role: 'assistant', content: 'This error typically occurs when you\'re trying to call .map() on a variable that is undefined. Can you share the component code?' },
    { role: 'user', content: '```tsx\nfunction UserList({ users }) {\n  return (\n    <ul>\n      {users.map(user => <li key={user.id}>{user.name}</li>)}\n    </ul>\n  );\n}\n```' },
    { role: 'assistant', content: 'The issue is that `users` might be undefined when the component first renders. You should add a safety check:\n\n```tsx\nfunction UserList({ users = [] }) {\n  return (\n    <ul>\n      {users.map(user => <li key={user.id}>{user.name}</li>)}\n    </ul>\n  );\n}\n```\n\nAlternatively, you can use optional chaining:\n```tsx\n{users?.map(user => <li key={user.id}>{user.name}</li>)}\n```' },
    { role: 'user', content: 'Perfect, using the default parameter fixed it. Thanks!' },
  ],
};

export const ARCHITECTURE_DECISION_CONVERSATION: Conversation = {
  id: 'conv-arch-decision',
  createdAt: new Date('2024-01-16T14:00:00Z'),
  updatedAt: new Date('2024-01-16T14:45:00Z'),
  messages: [
    { role: 'user', content: 'Should we use Redux or React Context for state management in our new dashboard?' },
    { role: 'assistant', content: 'It depends on your needs. Let me break down the considerations:\n\n**Redux:**\n- Better for complex state with many updates\n- Excellent DevTools for debugging\n- Middleware support (redux-thunk, redux-saga)\n- Steeper learning curve\n\n**React Context:**\n- Built into React, no extra dependencies\n- Good for simpler state (theme, auth)\n- Can cause unnecessary re-renders if not optimized\n- Simpler mental model\n\nFor a dashboard with many interactive widgets and data, I\'d recommend Redux Toolkit. For simpler applications, Context is sufficient.' },
    { role: 'user', content: 'We have about 15 widgets that need to share data. Some update frequently.' },
    { role: 'assistant', content: 'With 15 widgets and frequent updates, I strongly recommend **Redux Toolkit** with **RTK Query** for data fetching. Here\'s why:\n\n1. **Automatic caching** - RTK Query handles cache invalidation\n2. **Optimistic updates** - Better UX for frequent changes\n3. **Normalized state** - Prevents data duplication\n4. **DevTools** - Essential for debugging complex state\n\n```typescript\n// store/api.ts\nimport { createApi, fetchBaseQuery } from \'@reduxjs/toolkit/query/react\';\n\nexport const dashboardApi = createApi({\n  baseQuery: fetchBaseQuery({ baseUrl: \'/api\' }),\n  endpoints: (builder) => ({\n    getWidgetData: builder.query({\n      query: (widgetId) => `/widgets/${widgetId}`,\n    }),\n  }),\n});\n```' },
  ],
};

export const PATTERN_DISCOVERY_CONVERSATION: Conversation = {
  id: 'conv-pattern',
  createdAt: new Date('2024-01-17T09:00:00Z'),
  updatedAt: new Date('2024-01-17T09:20:00Z'),
  messages: [
    { role: 'user', content: 'How do I implement retry logic for API calls?' },
    { role: 'assistant', content: 'Here\'s a robust retry pattern with exponential backoff:\n\n```typescript\nasync function fetchWithRetry<T>(\n  fn: () => Promise<T>,\n  options: {\n    maxRetries?: number;\n    baseDelay?: number;\n    maxDelay?: number;\n  } = {}\n): Promise<T> {\n  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;\n  \n  for (let attempt = 0; attempt <= maxRetries; attempt++) {\n    try {\n      return await fn();\n    } catch (error) {\n      if (attempt === maxRetries) throw error;\n      \n      const delay = Math.min(\n        baseDelay * Math.pow(2, attempt),\n        maxDelay\n      );\n      await new Promise(r => setTimeout(r, delay));\n    }\n  }\n  throw new Error(\'Unreachable\');\n}\n\n// Usage\nconst data = await fetchWithRetry(() => fetch(\'/api/data\'));\n```\n\nThis pattern:\n- Uses exponential backoff (1s, 2s, 4s...)\n- Has a maximum delay cap\n- Is generic and reusable' },
  ],
};

export const CODE_REVIEW_CONVERSATION: Conversation = {
  id: 'conv-code-review',
  createdAt: new Date('2024-01-18T11:00:00Z'),
  updatedAt: new Date('2024-01-18T11:40:00Z'),
  messages: [
    { role: 'user', content: 'Can you review this function?\n```typescript\nfunction processData(data: any) {\n  var result = [];\n  for (var i = 0; i < data.length; i++) {\n    if (data[i].active == true) {\n      result.push(data[i].value);\n    }\n  }\n  return result;\n}\n```' },
    { role: 'assistant', content: 'Here are my suggestions:\n\n1. **Avoid `any`** - Use proper types\n2. **Use `const`/`let`** - Not `var`\n3. **Use `===`** - Strict equality\n4. **Use array methods** - More readable\n\nImproved version:\n```typescript\ninterface DataItem {\n  active: boolean;\n  value: unknown;\n}\n\nfunction processData(data: DataItem[]): unknown[] {\n  return data\n    .filter(item => item.active)\n    .map(item => item.value);\n}\n```\n\nThis is more type-safe, concise, and follows modern JavaScript patterns.' },
  ],
};

export const PREFERENCE_SETTING_CONVERSATION: Conversation = {
  id: 'conv-preference',
  createdAt: new Date('2024-01-19T15:00:00Z'),
  updatedAt: new Date('2024-01-19T15:05:00Z'),
  messages: [
    { role: 'user', content: 'When you write TypeScript code, please always use single quotes instead of double quotes' },
    { role: 'assistant', content: 'Understood! I\'ll use single quotes for strings in TypeScript code from now on. For example:\n\n```typescript\nconst message = \'Hello, world!\';\nconst name = \'John\';\n```\n\nInstead of:\n```typescript\nconst message = "Hello, world";\n```' },
  ],
};

export const MULTI_TURN_DEBUG_CONVERSATION: Conversation = {
  id: 'conv-multi-debug',
  createdAt: new Date('2024-01-20T10:00:00Z'),
  updatedAt: new Date('2024-01-20T11:00:00Z'),
  messages: [
    { role: 'user', content: 'My API endpoint is returning 500 errors intermittently' },
    { role: 'assistant', content: 'Intermittent 500 errors can be tricky. Let\'s debug systematically:\n\n1. Are these errors under load or random?\n2. Do you have error logging showing the stack trace?\n3. Is your database connection stable?' },
    { role: 'user', content: 'They happen more under load. Here\'s the error: "ECONNRESET"' },
    { role: 'assistant', content: 'ECONNRESET under load suggests connection pool exhaustion. Check:\n\n1. Database connection pool size\n2. Connection timeouts\n3. Whether connections are being released\n\nWhat database are you using and how is the pool configured?' },
    { role: 'user', content: 'PostgreSQL with default pool of 10 connections' },
    { role: 'assistant', content: 'With high load, 10 connections is often insufficient. Here\'s a fix:\n\n```typescript\nimport { Pool } from \'pg\';\n\nconst pool = new Pool({\n  max: 20,                    // Increase from 10\n  idleTimeoutMillis: 30000,   // Close idle connections\n  connectionTimeoutMillis: 5000,\n});\n\n// Always release connections\nconst client = await pool.connect();\ntry {\n  await client.query(\'SELECT...\');\n} finally {\n  client.release();  // Critical!\n}\n```\n\nAlso consider using connection pooling middleware like PgBouncer in production.' },
    { role: 'user', content: 'Found it! We weren\'t releasing connections in one of our error handlers' },
    { role: 'assistant', content: 'Classic issue! Always use try/finally to ensure connections are released:\n\n```typescript\nasync function queryWithRelease<T>(query: string): Promise<T> {\n  const client = await pool.connect();\n  try {\n    const result = await client.query(query);\n    return result.rows as T;\n  } finally {\n    client.release(); // Always runs, even on error\n  }\n}\n```\n\nOr use a wrapper function that handles this automatically.' },
  ],
};

export const ALL_CONVERSATIONS = [
  DEBUG_SESSION_CONVERSATION,
  ARCHITECTURE_DECISION_CONVERSATION,
  PATTERN_DISCOVERY_CONVERSATION,
  CODE_REVIEW_CONVERSATION,
  PREFERENCE_SETTING_CONVERSATION,
  MULTI_TURN_DEBUG_CONVERSATION,
];

export function getConversationById(id: string): Conversation | undefined {
  return ALL_CONVERSATIONS.find(c => c.id === id);
}
