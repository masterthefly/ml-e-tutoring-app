import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { redisService } from './redis.service.js';
import { bedrockService } from './bedrock.service.js';
import { authService } from './auth.service.js';
import { analyticsService } from './analytics.service.js';
import { SessionRepositoryImpl } from '../database/repositories/session.repository.js';
import { Message } from '../types/index.js';

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
  private sessionRepository: SessionRepositoryImpl;

  constructor() {
    this.sessionRepository = new SessionRepositoryImpl();
  }

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
        const token = socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.replace('Bearer ', '') ||
          socket.request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          logger.warn('WebSocket connection attempted without token');
          return next(new Error('Authentication token required'));
        }

        const jwtSecret = process.env.JWT_SECRET || 'ml-e-super-secret-jwt-key-for-development-only-change-in-production-2024';
        const decoded = jwt.verify(token, jwtSecret) as any;

        socket.userId = decoded.userId;
        socket.username = decoded.username;

        logger.info(`WebSocket authentication successful for user: ${socket.userId} (${socket.username})`);
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

    // Set up heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { timestamp: new Date() });
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // Send heartbeat every 30 seconds

    // Clear heartbeat on disconnect
    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
    });

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      try {
        await this.handleChatMessage(socket, data);
      } catch (error) {
        logger.error(`Error in chat message handler for user ${userId}:`, error);
        socket.emit('error', {
          message: 'Failed to process message. Please try again.'
        });
      }
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

      // Check for duplicate/similar questions BEFORE calling LLM
      const cachedResponse = await this.checkForCachedResponse(userId, sessionId, message.trim());
      if (cachedResponse) {
        logger.info(`Using cached response for duplicate question from user ${userId}: "${message.trim().substring(0, 50)}..."`);
        
        // Send cached response with updated timestamp and cache indicator
        const cachedAgentMessage: ChatMessage = {
          ...cachedResponse,
          id: `cached_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date(),
          message: `${cachedResponse.message}\n\n*[This response was retrieved from your previous conversations]*`
        };

        socket.emit('chat:message', cachedAgentMessage);
        
        // Store both user message and cached response in MongoDB
        if (sessionId) {
          await this.storeMessageInMongoDB(sessionId, chatMessage);
          await this.storeMessageInMongoDB(sessionId, cachedAgentMessage);
        }
        
        return;
      }

      // Store user message in MongoDB
      if (sessionId) {
        await this.storeMessageInMongoDB(sessionId, chatMessage);
      }

      // Track session activity
      if (sessionId) {
        await analyticsService.updateSessionActivity(sessionId, 1, message.includes('?') ? 1 : 0);
      }

      // Show typing indicator for agent
      socket.emit('chat:typing', {
        userId: 'system',
        username: 'ML-E Tutor',
        isTyping: true
      });

      // Get user info for personalized response
      let userGrade = 10; // default
      try {
        const user = await authService.getUserById(userId);
        if (user) {
          userGrade = user.grade;
        }
      } catch (error) {
        logger.warn('Could not fetch user grade, using default:', error instanceof Error ? error.message : String(error));
      }

      // Generate intelligent response using AWS Bedrock
      const agentResponse = await bedrockService.generateMLResponse(message.trim(), userGrade);

      // Create agent response message
      const agentMessage: ChatMessage = {
        id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: 'system',
        username: `ML-E (${agentResponse.model.includes('haiku') ? 'Fast' : 'Balanced'})`,
        message: agentResponse.message,
        timestamp: new Date(),
        sessionId,
        agentResponse: true
      };

      // Send agent response to user
      socket.emit('chat:message', agentMessage);

      // Store agent response in MongoDB
      if (sessionId) {
        await this.storeMessageInMongoDB(sessionId, agentMessage);
      }

      // Stop typing indicator
      socket.emit('chat:typing', {
        userId: 'system',
        username: 'ML-E Tutor',
        isTyping: false
      });

      // Track learning progress if topic detected
      if (sessionId && agentResponse.metadata?.topic && agentResponse.metadata.topic !== 'general') {
        await analyticsService.trackProgress({
          userId,
          sessionId,
          topicId: agentResponse.metadata.topic.replace(/\s+/g, '_').toLowerCase(),
          topicName: agentResponse.metadata.topic,
          action: 'progressed',
          progressPercentage: Math.min(100, Math.random() * 30 + 20), // Simulated progress
          timeSpent: Math.floor(Math.random() * 300 + 60), // 1-5 minutes
          difficultyLevel: userGrade === 9 ? 4 : 6,
          masteryLevel: userGrade === 9 ? 'beginner' : 'intermediate',
          metadata: {
            conceptsUnderstood: [agentResponse.metadata.topic],
            questionsAnswered: message.includes('?') ? 1 : 0
          }
        });
      }

      logger.info(`Bedrock response sent to user ${userId}`, {
        confidence: agentResponse.confidence,
        model: agentResponse.model,
        topic: agentResponse.metadata?.topic,
        responseTime: agentResponse.responseTime,
        tokensUsed: agentResponse.tokensUsed
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
   * Store message in MongoDB for persistent session storage
   */
  private async storeMessageInMongoDB(sessionId: string, chatMessage: ChatMessage): Promise<void> {
    try {
      // Convert ChatMessage to Message format for MongoDB
      const message: Message = {
        id: chatMessage.id,
        sender: chatMessage.agentResponse ? 'tutor' : 'student',
        content: chatMessage.message,
        timestamp: chatMessage.timestamp,
        metadata: {
          messageType: chatMessage.agentResponse ? 'explanation' : 'question',
          agentId: chatMessage.agentResponse ? 'ml-tutor' : undefined,
          topicId: 'machine-learning', // Could be derived from message content
          difficulty: 5, // Default difficulty
          hasCode: chatMessage.message.includes('```') || chatMessage.message.includes('code'),
          hasMath: /\b(equation|formula|calculate|math|algorithm)\b/i.test(chatMessage.message)
        }
      };

      // Ensure session exists or create it
      let session = await this.sessionRepository.findSessionById(sessionId);
      if (!session) {
        // Create new session if it doesn't exist
        session = await this.sessionRepository.createSession({
          userId: chatMessage.userId,
          currentTopic: 'machine-learning'
        });
        logger.info(`Created new session ${sessionId} for user ${chatMessage.userId}`);
      }

      // Add message to session
      await this.sessionRepository.addMessage(sessionId, message);
      
      // Also store in Redis for fast access (fallback)
      await this.storeMessageInRedis(sessionId, chatMessage);
      
      logger.debug(`Message stored in MongoDB for session ${sessionId}: ${message.content.substring(0, 50)}...`);
    } catch (error) {
      logger.error('Failed to store message in MongoDB:', error);
      // Fallback to Redis only
      await this.storeMessageInRedis(sessionId, chatMessage);
    }
  }

  /**
   * Store message in Redis for session persistence (fallback)
   */
  private async storeMessageInRedis(sessionId: string, message: ChatMessage): Promise<void> {
    try {
      const key = `session:${sessionId}:messages`;
      await redisService.lpush(key, JSON.stringify(message));

      // Keep only last 100 messages per session
      await redisService.ltrim(key, 0, 99);

      // Set expiration for session messages (24 hours)
      await redisService.expire(key, 24 * 60 * 60);
    } catch (error) {
      logger.warn('Redis not available, message not persisted:', error instanceof Error ? error.message : String(error));
      // Don't throw error - continue without persistence
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
      logger.warn('Redis not available, returning empty message history:', error instanceof Error ? error.message : String(error));
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
   * Check for cached response to similar questions across all user sessions
   */
  private async checkForCachedResponse(userId: string, currentSessionId: string, question: string): Promise<ChatMessage | null> {
    try {
      const normalizedQuestion = this.normalizeQuestion(question);
      
      // First check current session from MongoDB
      if (currentSessionId) {
        const currentSessionResponse = await this.checkSessionForDuplicate(currentSessionId, normalizedQuestion);
        if (currentSessionResponse) {
          return currentSessionResponse;
        }
      }

      // Then check user's recent sessions from MongoDB
      const userSessions = await this.sessionRepository.findUserSessions(userId, 5); // Check last 5 sessions
      
      for (const session of userSessions) {
        if (session.id === currentSessionId) continue; // Skip current session (already checked)
        
        const sessionResponse = await this.checkSessionForDuplicate(session.id, normalizedQuestion);
        if (sessionResponse) {
          return sessionResponse;
        }
      }

      // Fallback to Redis if MongoDB fails
      return await this.checkRedisForDuplicate(currentSessionId, normalizedQuestion);
      
    } catch (error) {
      logger.warn('Error checking cached responses:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Check a specific session for duplicate questions
   */
  private async checkSessionForDuplicate(sessionId: string, normalizedQuestion: string): Promise<ChatMessage | null> {
    try {
      // Get conversation history from MongoDB
      const messages = await this.sessionRepository.getConversationHistory(sessionId, 50); // Check last 50 messages
      
      for (let i = 0; i < messages.length - 1; i++) {
        const userMsg = messages[i];
        const agentMsg = messages[i + 1];

        // Check if we have a user question followed by agent response
        if (userMsg.sender === 'student' && agentMsg.sender === 'tutor') {
          const cachedQuestion = this.normalizeQuestion(userMsg.content);
          
          if (this.isSimilarQuestion(normalizedQuestion, cachedQuestion)) {
            logger.info(`Found duplicate question in session ${sessionId}: "${userMsg.content.substring(0, 50)}..."`);
            
            // Convert MongoDB Message to ChatMessage format
            return {
              id: agentMsg.id,
              userId: 'system',
              username: 'ML-E Tutor',
              message: agentMsg.content,
              timestamp: agentMsg.timestamp,
              sessionId: sessionId,
              agentResponse: true
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Error checking session ${sessionId} for duplicates:`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Fallback to check Redis for duplicate questions
   */
  private async checkRedisForDuplicate(sessionId: string, normalizedQuestion: string): Promise<ChatMessage | null> {
    if (!sessionId) return null;

    try {
      const messages = await this.getSessionMessages(sessionId);
      
      // Look for similar questions in recent messages (last 20 messages)
      const recentMessages = messages.slice(-20);
      
      for (let i = 0; i < recentMessages.length - 1; i++) {
        const userMsg = recentMessages[i];
        const agentMsg = recentMessages[i + 1];

        // Check if we have a user question followed by agent response
        if (!userMsg.agentResponse && agentMsg.agentResponse) {
          const cachedQuestion = this.normalizeQuestion(userMsg.message);
          
          if (this.isSimilarQuestion(normalizedQuestion, cachedQuestion)) {
            return agentMsg;
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn('Error checking Redis for cached responses:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Normalize question for comparison
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Check if two questions are similar (enhanced duplicate detection)
   */
  private isSimilarQuestion(question1: string, question2: string): boolean {
    // Exact match
    if (question1 === question2) {
      return true;
    }

    // Check if one question contains the other (for variations like "what is ML?" vs "what is machine learning?")
    if (question1.includes(question2) || question2.includes(question1)) {
      return true;
    }

    // Split into significant words (length > 2 to avoid common words like "is", "the", etc.)
    const words1 = question1.split(' ').filter(word => word.length > 2);
    const words2 = question2.split(' ').filter(word => word.length > 2);
    
    if (words1.length === 0 || words2.length === 0) {
      return false;
    }

    // Calculate similarity based on common significant words
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    // Enhanced similarity check with different thresholds based on question length
    if (words1.length <= 3 || words2.length <= 3) {
      // For short questions, require higher similarity (80%)
      return similarity >= 0.8;
    } else {
      // For longer questions, 70% similarity is sufficient
      return similarity >= 0.7;
    }
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