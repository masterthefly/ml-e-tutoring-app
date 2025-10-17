export interface Message {
  id: string;
  sender: 'student' | 'tutor' | 'assessment' | 'content' | 'coordinator' | 'system';
  content: string;
  timestamp: Date;
  metadata: MessageMetadata;
}

export interface MessageMetadata {
  agentId?: string;
  topicId?: string;
  messageType: 'explanation' | 'question' | 'assessment' | 'feedback' | 'system' | 'error';
  difficulty?: number;
  hasCode?: boolean;
  hasMath?: boolean;
  errorCode?: string;
  severity?: 'low' | 'medium' | 'high';
  canRetry?: boolean;
  confidence?: number;
}

export interface ChatAgent {
  id: string;
  name: string;
  type: 'tutor' | 'assessment' | 'content' | 'coordinator';
  avatar?: string;
  status: 'active' | 'idle' | 'typing' | 'error';
}

export interface ChatSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  messages: Message[];
  currentTopic?: string;
  activeAgents: ChatAgent[];
}

export interface TypingStatus {
  agentId: string;
  agentName: string;
  isTyping: boolean;
}

export interface ChatError {
  code: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}