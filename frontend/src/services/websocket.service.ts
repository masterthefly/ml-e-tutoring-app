import { io, Socket } from 'socket.io-client';
import { authService } from './auth.service';

export interface CustomWebSocketEvents {
  // Chat events
  'chat:message': (data: any) => void;
  'chat:typing': (data: { userId: string; username: string; isTyping: boolean }) => void;
  'connected': (data: any) => void;
  'heartbeat': (data: any) => void;

  // Legacy events for compatibility
  'message': (data: any) => void;
  'typing': (data: { agent: string; isTyping: boolean }) => void;
  'agent-response': (data: any) => void;

  // Progress events
  'progress-update': (data: any) => void;
  'progress-error': (data: any) => void;
  'progress-increment': (data: any) => void;
  'assessment-complete': (data: any) => void;
}

// Socket.IO reserved events are handled separately
export interface SocketIOEvents {
  'connect': () => void;
  'disconnect': (reason: string) => void;
  'reconnect': () => void;
  'connect_error': (error: Error) => void;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        return;
      }

      this.isConnecting = true;

      const token = authService.getToken();
      if (!token) {
        this.isConnecting = false;
        reject(new Error('No authentication token available'));
        return;
      }

      this.socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
        auth: {
          token,
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.isConnecting = false;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          reject(error);
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);

        // Auto-reconnect unless it was a manual disconnect
        if (reason !== 'io client disconnect' && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('reconnect', () => {
        console.log('WebSocket reconnected');
        this.reconnectAttempts = 0;
      });

      // Handle heartbeat to keep connection alive
      this.socket.on('heartbeat', () => {
        // Respond to heartbeat to confirm connection is alive
        this.socket?.emit('heartbeat-response', { timestamp: new Date().toISOString() });
      });
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (!this.socket?.connected) {
        this.connect().catch(console.error);
      }
    }, delay);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Event listeners for custom events
  on<K extends keyof CustomWebSocketEvents>(event: K, callback: CustomWebSocketEvents[K]): void {
    if (this.socket) {
      this.socket.on(event as string, callback as any);
    }
  }

  off<K extends keyof CustomWebSocketEvents>(event: K, callback?: CustomWebSocketEvents[K]): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event as string, callback as any);
      } else {
        this.socket.off(event as string);
      }
    }
  }

  // Event listeners for Socket.IO reserved events
  onConnect(callback: () => void): void {
    if (this.socket) {
      this.socket.on('connect', callback);
    }
  }

  onDisconnect(callback: (reason: string) => void): void {
    if (this.socket) {
      this.socket.on('disconnect', callback);
    }
  }

  onReconnect(callback: () => void): void {
    if (this.socket) {
      this.socket.on('reconnect', callback);
    }
  }

  onConnectError(callback: (error: Error) => void): void {
    if (this.socket) {
      this.socket.on('connect_error', callback);
    }
  }

  // Off methods for Socket.IO reserved events
  offConnect(callback?: () => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off('connect', callback);
      } else {
        this.socket.off('connect');
      }
    }
  }

  offDisconnect(callback?: (reason: string) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off('disconnect', callback);
      } else {
        this.socket.off('disconnect');
      }
    }
  }

  offReconnect(callback?: () => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off('reconnect', callback);
      } else {
        this.socket.off('reconnect');
      }
    }
  }

  offConnectError(callback?: (error: Error) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off('connect_error', callback);
      } else {
        this.socket.off('connect_error');
      }
    }
  }

  // Emit events
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Cannot emit event: WebSocket not connected');
    }
  }

  // Chat-specific methods
  sendMessage(content: string, sessionId?: string): void {
    this.emit('chat:message', {
      message: content,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  joinChatSession(sessionId: string): void {
    this.emit('session:join', sessionId);
  }

  leaveChatSession(sessionId: string): void {
    this.emit('session:leave');
  }

  // Progress-specific methods
  requestProgressUpdate(): void {
    this.emit('get-progress');
  }

  // Typing indicators
  sendTypingStatus(isTyping: boolean, sessionId?: string): void {
    this.emit('chat:typing', {
      isTyping,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }
}

export const websocketService = new WebSocketService();