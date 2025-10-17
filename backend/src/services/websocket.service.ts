import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { redisService } from './redis.service.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  sessionId?: string;
  agentResponse?: boolean;
}

interface TypingData {
  userId: string;
  username: string;
  isTyping: boolean;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedUsers = new Map<string, AuthenticatedSocket>();
  private userSessions = new Map<string, string>(); // userId -> sessionId

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.userId;
        socket.username = decoded.username;

        logger.info(`WebSocket authentication successful for user: ${socket.userId}`);
        next();
      } catch (error) {
        logger.error('WebSocket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    const username = socket.username!;

    logger.info(`User connected via WebSocket: ${userId} (${username})`);

    // Store connected user
    this.connectedUsers.set(userId, socket);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // Send connection confirmation
    socket.emit('connected', {
      userId,
      username,
      timestamp: new Date()
    });

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      await this.handleChatMessage(socket, data);
    });

    // Handle typing indicators
    socket.on('chat:typing', (data) => {
      this.handleTyping(socket, data);
    });

    // Handle session management
    socket.on('session:join', (sessionId: string) => {
      this.handleSessionJoin(socket, sessionId);
    });

    socket.on('session:leave', () => {
      this.handleSessionLeave(socket);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for user ${userId}:`, error);
    });
  }

  /**
   * Handle chat message from client
   */
  private async handleChatMessage(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { message, sessionId, context } = data;
      const userId = socket.userId!;
      const username = socket.username!;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('error', { message: 'Invalid message format' });
        return;
      }

      if (message.length > 1000) {
        socket.emit('error', { message: 'Message too long (max 1000 characters)' });
        return;
      }

      const chatMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        username,
        message: message.trim(),
        timestamp: new Date(),
        sessionId,
        agentResponse: false
      };

      logger.info(`Chat message received from ${userId}: ${message.substring(0, 100)}...`);

      // Emit message to user immediately for instant feedback
      socket.emit('chat:message', chatMessage);

      // Store message in session if sessionId provided
      if (sessionId) {
        await this.storeMessage(sessionId, chatMessage);
      }

      // Mock agent system response for now
      const agentResponse = {
        message: `Thank you for your message: "${message.trim()}". The multi-agent system is being implemented and will provide intelligent responses soon.`,
        agentName: 'ML-E Assistant',
        sessionId: sessionId || `session_${Date.now()}`,
        timestamp: new Date()
      };

      // Create agent response message
      const agentMessage: ChatMessage = {
        id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: 'system',
        username: agentResponse.agentName || 'ML-E Assistant',
        message: agentResponse.message,
        timestamp: new Date(),
        sessionId,
        agentResponse: true
      };

      // Send agent response to user
      socket.emit('chat:message', agentMessage);

      // Store agent response in session
      if (sessionId) {
        await this.storeMessage(sessionId, agentMessage);
      }

      // Emit typing stopped for agent
      socket.emit('chat:typing', {
        userId: 'system',
        username: agentResponse.agentName || 'ML-E Assistant',
        isTyping: false
      });

    } catch (error) {
      logger.error('Error handling chat message:', error);
      socket.emit('error', { 
        message: 'Failed to process message. Please try again.' 
      });
    }
  }

  /**
   * Handle typing indicators
   */
  private handleTyping(socket: AuthenticatedSocket, data: TypingData): void {
    const userId = socket.userId!;
    const sessionId = this.userSessions.get(userId);

    if (sessionId) {
      // Broadcast typing status to other users in the same session
      socket.to(`session:${sessionId}`).emit('chat:typing', {
        userId,
        username: socket.username!,
        isTyping: data.isTyping
      });
    }
  }

  /**
   * Handle user joining a session
   */
  private handleSessionJoin(socket: AuthenticatedSocket, sessionId: string): void {
    const userId = socket.userId!;
    
    // Leave previous session if any
    const previousSessionId = this.userSessions.get(userId);
    if (previousSessionId) {
      socket.leave(`session:${previousSessionId}`);
    }

    // Join new session
    socket.join(`session:${sessionId}`);
    this.userSessions.set(userId, sessionId);

    logger.info(`User ${userId} joined session: ${sessionId}`);

    // Notify other users in session
    socket.to(`session:${sessionId}`).emit('session:user_joined', {
      userId,
      username: socket.username!,
      timestamp: new Date()
    });
  }

  /**
   * Handle user leaving a session
   */
  private handleSessionLeave(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    const sessionId = this.userSessions.get(userId);

    if (sessionId) {
      socket.leave(`session:${sessionId}`);
      this.userSessions.delete(userId);

      logger.info(`User ${userId} left session: ${sessionId}`);

      // Notify other users in session
      socket.to(`session:${sessionId}`).emit('session:user_left', {
        userId,
        username: socket.username!,
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle user disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId!;
    
    logger.info(`User disconnected: ${userId}`);

    // Remove from connected users
    this.connectedUsers.delete(userId);

    // Leave session if any
    this.handleSessionLeave(socket);
  }

  /**
   * Store message in Redis for session persistence
   */
  private async storeMessage(sessionId: string, message: ChatMessage): Promise<void> {
    try {
      const key = `session:${sessionId}:messages`;
      await redisService.lpush(key, JSON.stringify(message));
      
      // Keep only last 100 messages per session
      await redisService.ltrim(key, 0, 99);
      
      // Set expiration for session messages (24 hours)
      await redisService.expire(key, 24 * 60 * 60);
    } catch (error) {
      logger.error('Error storing message in Redis:', error);
    }
  }

  /**
   * Get message history for a session
   */
  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const key = `session:${sessionId}:messages`;
      const messages = await redisService.lrange(key, 0, -1);
      
      return messages.map(msg => JSON.parse(msg)).reverse(); // Reverse to get chronological order
    } catch (error) {
      logger.error('Error retrieving session messages:', error);
      return [];
    }
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, event: string, data: any): void {
    const socket = this.connectedUsers.get(userId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  /**
   * Send message to all users in a session
   */
  sendToSession(sessionId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`session:${sessionId}`).emit(event, data);
    }
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.io) {
      this.io.close();
      this.connectedUsers.clear();
      this.userSessions.clear();
      logger.info('WebSocket server shut down');
    }
  }
}

export const webSocketService = new WebSocketService();