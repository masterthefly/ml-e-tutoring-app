import { 
  User, 
  CreateUserRequest,
  LoginRequest
} from '../types/user.js';
import {
  LearningSession, 
  Message
} from '../types/session.js';
import {
  StudentProgress
} from '../types/progress.js';
import {
  AgentState,
  AgentMessage
} from '../types/agent.js';

// Serialization helpers for API communication
export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SerializationError';
  }
}

// Date serialization helpers
export const serializeDate = (date: Date): string => {
  return date.toISOString();
};

export const deserializeDate = (dateString: string): Date => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new SerializationError(`Invalid date string: ${dateString}`);
  }
  return date;
};

// User serialization
export const serializeUser = (user: User): Record<string, any> => {
  return {
    ...user,
    createdAt: serializeDate(user.createdAt),
    lastActive: serializeDate(user.lastActive)
  };
};

export const deserializeUser = (data: Record<string, any>): User => {
  try {
    return {
      ...data,
      createdAt: deserializeDate(data.createdAt),
      lastActive: deserializeDate(data.lastActive)
    } as User;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Session serialization
export const serializeLearningSession = (session: LearningSession): Record<string, any> => {
  return {
    ...session,
    startTime: serializeDate(session.startTime),
    endTime: session.endTime ? serializeDate(session.endTime) : undefined,
    conversationHistory: session.conversationHistory.map(serializeMessage),
    agentStates: session.agentStates.map(serializeAgentState)
  };
};

export const deserializeLearningSession = (data: Record<string, any>): LearningSession => {
  try {
    return {
      ...data,
      startTime: deserializeDate(data.startTime),
      endTime: data.endTime ? deserializeDate(data.endTime) : undefined,
      conversationHistory: data.conversationHistory.map(deserializeMessage),
      agentStates: data.agentStates.map(deserializeAgentState)
    } as LearningSession;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize learning session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Message serialization
export const serializeMessage = (message: Message): Record<string, any> => {
  return {
    ...message,
    timestamp: serializeDate(message.timestamp)
  };
};

export const deserializeMessage = (data: Record<string, any>): Message => {
  try {
    return {
      ...data,
      timestamp: deserializeDate(data.timestamp)
    } as Message;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Progress serialization
export const serializeStudentProgress = (progress: StudentProgress): Record<string, any> => {
  return {
    ...progress,
    lastUpdated: serializeDate(progress.lastUpdated),
    topicsCompleted: progress.topicsCompleted.map(topic => ({
      ...topic,
      lastAccessed: serializeDate(topic.lastAccessed)
    })),
    assessmentScores: progress.assessmentScores.map(assessment => ({
      ...assessment,
      completedAt: serializeDate(assessment.completedAt)
    }))
  };
};

export const deserializeStudentProgress = (data: Record<string, any>): StudentProgress => {
  try {
    return {
      ...data,
      lastUpdated: deserializeDate(data.lastUpdated),
      topicsCompleted: data.topicsCompleted.map((topic: Record<string, any>) => ({
        ...topic,
        lastAccessed: deserializeDate(topic.lastAccessed)
      })),
      assessmentScores: data.assessmentScores.map((assessment: Record<string, any>) => ({
        ...assessment,
        completedAt: deserializeDate(assessment.completedAt)
      }))
    } as StudentProgress;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize student progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Agent serialization
export const serializeAgentState = (agentState: AgentState): Record<string, any> => {
  return {
    ...agentState,
    lastUpdated: serializeDate(agentState.lastUpdated)
  };
};

export const deserializeAgentState = (data: Record<string, any>): AgentState => {
  try {
    return {
      ...data,
      lastUpdated: deserializeDate(data.lastUpdated)
    } as AgentState;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize agent state: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const serializeAgentMessage = (message: AgentMessage): Record<string, any> => {
  return {
    ...message,
    timestamp: serializeDate(message.timestamp)
  };
};

export const deserializeAgentMessage = (data: Record<string, any>): AgentMessage => {
  try {
    return {
      ...data,
      timestamp: deserializeDate(data.timestamp)
    } as AgentMessage;
  } catch (error) {
    throw new SerializationError(`Failed to deserialize agent message: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Generic serialization utilities
export const serializeArray = <T>(
  items: T[], 
  serializer: (item: T) => Record<string, any>
): Record<string, any>[] => {
  return items.map(serializer);
};

export const deserializeArray = <T>(
  data: Record<string, any>[], 
  deserializer: (data: Record<string, any>) => T
): T[] => {
  return data.map(deserializer);
};

// Safe JSON parsing with error handling
export const safeJsonParse = <T>(jsonString: string): T | null => {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('JSON parsing error:', error);
    return null;
  }
};

export const safeJsonStringify = (data: any): string | null => {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error('JSON stringify error:', error);
    return null;
  }
};

// Request/Response serialization helpers
export const sanitizeCreateUserRequest = (request: CreateUserRequest): CreateUserRequest => {
  return {
    username: request.username.trim(),
    email: request.email.toLowerCase().trim(),
    password: request.password, // Don't trim password as it might be intentional
    grade: request.grade
  };
};

export const sanitizeLoginRequest = (request: LoginRequest): LoginRequest => {
  return {
    email: request.email.toLowerCase().trim(),
    password: request.password
  };
};

// API response formatting
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export const createSuccessResponse = <T>(data: T): ApiResponse<T> => {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
};

export const createErrorResponse = (error: string): ApiResponse<never> => {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString()
  };
};