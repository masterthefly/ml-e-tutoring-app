import { AgentState } from './agent.js';
import { ProgressData } from './progress.js';

export interface LearningSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  currentTopic: string;
  conversationHistory: Message[];
  agentStates: AgentState[];
  progressSnapshot: ProgressData;
}

export interface Message {
  id: string;
  sender: 'student' | 'tutor' | 'assessment' | 'content' | 'coordinator';
  content: string;
  timestamp: Date;
  metadata: MessageMetadata;
}

export interface MessageMetadata {
  agentId?: string;
  topicId?: string;
  messageType: 'explanation' | 'question' | 'assessment' | 'feedback' | 'system';
  difficulty?: number;
  hasCode?: boolean;
  hasMath?: boolean;
}

export interface CreateSessionRequest {
  userId: string;
  topic?: string;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;
  metadata?: Partial<MessageMetadata>;
}