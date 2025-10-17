export interface SessionData {
  sessionId: string;
  userId: string;
  agentStates: AgentSessionState[];
  conversationContext: ConversationContext;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface AgentSessionState {
  agentId: string;
  agentType: 'coordinator' | 'tutor' | 'assessment' | 'content';
  status: 'active' | 'idle' | 'busy' | 'error';
  context: Record<string, any>;
  lastAction: string;
  lastUpdated: Date;
}

export interface ConversationContext {
  currentTopic: string;
  topicHistory: string[];
  messageCount: number;
  lastMessageTimestamp: Date;
  studentProgress: {
    currentLevel: number;
    completedConcepts: string[];
    strugglingConcepts: string[];
  };
  adaptiveSettings: {
    difficultyLevel: number;
    learningPace: 'slow' | 'medium' | 'fast';
    preferredExplanationStyle: string;
  };
}

export interface SessionCreateRequest {
  userId: string;
  initialTopic?: string;
}

export interface SessionUpdateRequest {
  sessionId: string;
  agentStates?: AgentSessionState[];
  conversationContext?: Partial<ConversationContext>;
  lastActivity?: Date;
}

export interface SessionSyncData {
  sessionId: string;
  agentId: string;
  agentType: string;
  state: Record<string, any>;
  timestamp: Date;
}