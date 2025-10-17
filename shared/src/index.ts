// User types
export * from './types/user.js';

// Session types
export * from './types/session.js';

// Agent types
export * from './types/agent.js';

// Progress types
export * from './types/progress.js';

// Content types
export * from './types/content.js';

// API types
export * from './types/api.js';

// Validation utilities
export * from './validation/index.js';

// Serialization utilities
export * as serialization from './serialization/index.js';

// Constants
export const AGENT_TYPES = ['coordinator', 'tutor', 'assessment', 'content'] as const;
export const MESSAGE_TYPES = ['explanation', 'question', 'assessment', 'feedback', 'system'] as const;
export const MASTERY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const LEARNING_PACES = ['slow', 'medium', 'fast'] as const;

// Validation helpers
export const isValidGrade = (grade: number): grade is 9 | 10 => {
  return grade === 9 || grade === 10;
};

export const isValidAgentType = (type: string): type is import('./types/agent.js').AgentType => {
  return AGENT_TYPES.includes(type as any);
};

export const isValidMessageType = (type: string): type is import('./types/session.js').MessageMetadata['messageType'] => {
  return MESSAGE_TYPES.includes(type as any);
};