export type AgentType = 'coordinator' | 'tutor' | 'assessment' | 'content';

export interface AgentState {
  agentId: string;
  agentType: AgentType;
  sessionId: string;
  context: Record<string, any>;
  lastAction: string;
  status: 'active' | 'idle' | 'error' | 'busy';
  capabilities: string[];
  lastUpdated: Date;
}

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent?: string; // undefined means broadcast to all agents
  type: 'request' | 'response' | 'notification' | 'coordination';
  payload: any;
  timestamp: Date;
  sessionId: string;
}

export interface AgentResponse {
  agentId: string;
  agentType: AgentType;
  content: string;
  confidence: number;
  suggestedActions?: string[];
  metadata: {
    processingTime: number;
    tokensUsed?: number;
    difficulty?: number;
    topicsCovered?: string[];
  };
}

export interface AgentCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
}

export interface CoordinationRequest {
  sessionId: string;
  studentMessage: string;
  currentContext: Record<string, any>;
  requiredCapabilities?: string[];
  priority: 'low' | 'medium' | 'high';
}