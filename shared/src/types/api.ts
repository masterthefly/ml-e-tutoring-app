export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// WebSocket event types
export interface SocketEvents {
  // Client to Server
  'join-session': { sessionId: string; userId: string };
  'send-message': { sessionId: string; message: string };
  'typing-start': { sessionId: string };
  'typing-stop': { sessionId: string };
  
  // Server to Client
  'session-joined': { sessionId: string; participants: string[] };
  'message-received': { message: any };
  'agent-typing': { agentType: string };
  'agent-response': { response: any };
  'session-error': { error: string };
  'progress-updated': { progress: any };
}

export type SocketEventName = keyof SocketEvents;