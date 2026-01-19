export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

let conversationCounter = 0;

export interface ConversationFactoryOptions {
  id?: string;
  messages?: ConversationMessage[];
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

export function createConversation(options: ConversationFactoryOptions = {}): Conversation {
  conversationCounter++;
  const now = new Date();

  return {
    id: options.id ?? `conv-${conversationCounter}`,
    messages: options.messages ?? [
      { role: 'user', content: 'Hello', timestamp: now },
      { role: 'assistant', content: 'Hi! How can I help you?', timestamp: now },
    ],
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    metadata: options.metadata,
  };
}

export function createProblemSolvingConversation(problem: string, solution: string): Conversation {
  const now = new Date();
  return createConversation({
    messages: [
      { role: 'user', content: `I'm having a problem: ${problem}`, timestamp: now },
      { role: 'assistant', content: `Here's how to solve it: ${solution}`, timestamp: now },
    ],
  });
}

export function createCodeDiscussionConversation(code: string, explanation: string, language: string = 'typescript'): Conversation {
  const now = new Date();
  return createConversation({
    messages: [
      { role: 'user', content: `Can you explain this code?\n\`\`\`${language}\n${code}\n\`\`\``, timestamp: now },
      { role: 'assistant', content: explanation, timestamp: now },
    ],
  });
}

export function createDecisionConversation(topic: string, decision: string, reasoning: string): Conversation {
  const now = new Date();
  return createConversation({
    messages: [
      { role: 'user', content: `Should we ${topic}?`, timestamp: now },
      { role: 'assistant', content: `I recommend ${decision}. Here's why: ${reasoning}`, timestamp: now },
    ],
  });
}

export function createMultiTurnConversation(turns: Array<{ user: string; assistant: string }>): Conversation {
  const now = new Date();
  const messages: ConversationMessage[] = [];

  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.user, timestamp: now });
    messages.push({ role: 'assistant', content: turn.assistant, timestamp: now });
  }

  return createConversation({ messages });
}

export function createErrorResolutionConversation(errorMessage: string, fix: string, filesAffected: string[] = []): Conversation {
  const now = new Date();
  const filesText = filesAffected.length > 0 ? `\n\nFiles affected: ${filesAffected.join(', ')}` : '';

  return createConversation({
    messages: [
      { role: 'user', content: `I'm getting this error:\n\`\`\`\n${errorMessage}\n\`\`\`` },
      { role: 'assistant', content: `This error can be fixed by: ${fix}${filesText}`, timestamp: now },
    ],
  });
}

export function createPatternDiscoveryConversation(
  patternName: string,
  implementation: string,
  useCase: string
): Conversation {
  const now = new Date();
  return createConversation({
    messages: [
      { role: 'user', content: `How should I implement ${useCase}?`, timestamp: now },
      {
        role: 'assistant',
        content: `You can use the ${patternName} pattern. Here's how:\n\n\`\`\`typescript\n${implementation}\n\`\`\``,
        timestamp: now,
      },
    ],
  });
}

export function createPreferenceConversation(aspect: string, preference: string): Conversation {
  const now = new Date();
  return createConversation({
    messages: [
      { role: 'user', content: `I prefer ${preference} for ${aspect}`, timestamp: now },
      { role: 'assistant', content: `Understood! I'll use ${preference} for ${aspect} going forward.`, timestamp: now },
    ],
  });
}

export function resetConversationCounter(): void {
  conversationCounter = 0;
}
