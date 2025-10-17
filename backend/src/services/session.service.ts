import { v4 as uuidv4 } from 'uuid';
import { redisService } from './redis.service.js';
import { SessionRepositoryImpl } from '../database/repositories/session.repository.js';
import { 
  SessionData, 
  SessionCreateRequest, 
  SessionUpdateRequest, 
  AgentSessionState, 
  ConversationContext,
  SessionSyncData 
} from '../types/session.types.js';
import { logger } from '../utils/logger.js';

export class SessionService {
  private readonly sessionRepository: SessionRepositoryImpl;
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds
  private readonly AGENT_STATE_TTL = 60 * 60; // 1 hour in seconds

  constructor() {
    this.sessionRepository = new SessionRepositoryImpl();
  }

  /**
   * Create a new learning session
   */
  async createSession(request: SessionCreateRequest): Promise<SessionData> {
    try {
      const sessionId = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (this.SESSION_TTL * 1000));

      const sessionData: SessionData = {
        sessionId,
        userId: request.userId,
        agentStates: [],
        conversationContext: {
          currentTopic: request.initialTopic || 'introduction',
          topicHistory: [],
          messageCount: 0,
          lastMessageTimestamp: now,
          studentProgress: {
            currentLevel: 1,
            completedConcepts: [],
            strugglingConcepts: []
          },
          adaptiveSettings: {
            difficultyLevel: 5,
            learningPace: 'medium',
            preferredExplanationStyle: 'conversational'
          }
        },
        createdAt: now,
        lastActivity: now,
        expiresAt,
        isActive: true
      };

      // Store in Redis for fast access
      await this.storeSessionInRedis(sessionData);

      // Store in MongoDB for persistence
      await this.sessionRepository.createSession({
        userId: request.userId,
        currentTopic: sessionData.conversationContext.currentTopic,
        progressSnapshot: {
          overallProgress: 0,
          currentTopic: sessionData.conversationContext.currentTopic,
          topicsCompleted: 0,
          totalTopics: 10, // Default curriculum size
          averageScore: 0,
          learningVelocity: 0,
          recommendedNextTopics: []
        }
      });

      logger.info(`Session created: ${sessionId} for user: ${request.userId}`);
      return sessionData;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      // Try Redis first for fast access
      const redisData = await this.getSessionFromRedis(sessionId);
      if (redisData) {
        return redisData;
      }

      // Fallback to MongoDB
      const dbSession = await this.sessionRepository.findSessionById(sessionId);
      if (!dbSession) {
        return null;
      }

      // Reconstruct session data from DB
      const sessionData: SessionData = {
        sessionId: dbSession.id,
        userId: dbSession.userId,
        agentStates: dbSession.agentStates.map((state: any) => ({
          agentId: state.agentId,
          agentType: state.agentType,
          status: state.status,
          context: state.context,
          lastAction: state.lastAction,
          lastUpdated: state.lastUpdated
        })),
        conversationContext: {
          currentTopic: dbSession.currentTopic,
          topicHistory: [], // Could be derived from conversation history
          messageCount: dbSession.conversationHistory.length,
          lastMessageTimestamp: dbSession.conversationHistory.length > 0 
            ? dbSession.conversationHistory[dbSession.conversationHistory.length - 1].timestamp 
            : dbSession.startTime,
          studentProgress: {
            currentLevel: 1, // Could be derived from progress snapshot
            completedConcepts: [],
            strugglingConcepts: []
          },
          adaptiveSettings: {
            difficultyLevel: 5,
            learningPace: 'medium',
            preferredExplanationStyle: 'conversational'
          }
        },
        createdAt: dbSession.startTime,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + (this.SESSION_TTL * 1000)),
        isActive: !dbSession.endTime
      };

      // Store back in Redis for future fast access
      await this.storeSessionInRedis(sessionData);

      return sessionData;
    } catch (error) {
      logger.error(`Failed to get session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Update session data
   */
  async updateSession(request: SessionUpdateRequest): Promise<SessionData | null> {
    try {
      const session = await this.getSession(request.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update session data
      if (request.agentStates) {
        session.agentStates = request.agentStates;
      }

      if (request.conversationContext) {
        session.conversationContext = {
          ...session.conversationContext,
          ...request.conversationContext
        };
      }

      session.lastActivity = request.lastActivity || new Date();

      // Update in Redis
      await this.storeSessionInRedis(session);

      // Update in MongoDB (async, don't wait)
      this.updateSessionInDatabase(session).catch(error => {
        logger.error('Failed to update session in database:', error);
      });

      logger.debug(`Session updated: ${request.sessionId}`);
      return session;
    } catch (error) {
      logger.error(`Failed to update session ${request.sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Synchronize agent state across the multi-agent system
   */
  async syncAgentState(syncData: SessionSyncData): Promise<void> {
    try {
      const agentKey = `agent:${syncData.sessionId}:${syncData.agentId}`;
      
      const stateData = {
        agentId: syncData.agentId,
        agentType: syncData.agentType,
        state: JSON.stringify(syncData.state),
        timestamp: syncData.timestamp.toISOString()
      };

      // Store agent state in Redis hash
      await redisService.hSet(agentKey, 'agentId', stateData.agentId);
      await redisService.hSet(agentKey, 'agentType', stateData.agentType);
      await redisService.hSet(agentKey, 'state', stateData.state);
      await redisService.hSet(agentKey, 'timestamp', stateData.timestamp);
      
      // Set TTL for agent state
      await redisService.expire(agentKey, this.AGENT_STATE_TTL);

      // Update session with new agent state
      const session = await this.getSession(syncData.sessionId);
      if (session) {
        const existingStateIndex = session.agentStates.findIndex(
          state => state.agentId === syncData.agentId
        );

        const newAgentState: AgentSessionState = {
          agentId: syncData.agentId,
          agentType: syncData.agentType as any,
          status: 'active',
          context: syncData.state,
          lastAction: 'state_sync',
          lastUpdated: syncData.timestamp
        };

        if (existingStateIndex >= 0) {
          session.agentStates[existingStateIndex] = newAgentState;
        } else {
          session.agentStates.push(newAgentState);
        }

        await this.updateSession({
          sessionId: syncData.sessionId,
          agentStates: session.agentStates
        });
      }

      logger.debug(`Agent state synced: ${syncData.agentId} in session: ${syncData.sessionId}`);
    } catch (error) {
      logger.error('Failed to sync agent state:', error);
      throw error;
    }
  }

  /**
   * Get agent state for a specific agent in a session
   */
  async getAgentState(sessionId: string, agentId: string): Promise<Record<string, any> | null> {
    try {
      const agentKey = `agent:${sessionId}:${agentId}`;
      const stateData = await redisService.hGetAll(agentKey);

      if (!stateData.state) {
        return null;
      }

      return JSON.parse(stateData.state);
    } catch (error) {
      logger.error(`Failed to get agent state for ${agentId} in session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      session.isActive = false;
      session.lastActivity = new Date();

      // Update in database
      await this.sessionRepository.endSession(sessionId);

      // Remove from Redis
      await this.removeSessionFromRedis(sessionId);

      // Clean up agent states
      const agentKeys = await redisService.keys(`agent:${sessionId}:*`);
      for (const key of agentKeys) {
        await redisService.del(key);
      }

      logger.info(`Session ended: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to end session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessionKeys = await redisService.keys('session:*');
      const now = new Date();

      for (const key of sessionKeys) {
        const sessionData = await redisService.get(key);
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          if (session.expiresAt < now) {
            await this.endSession(session.sessionId);
          }
        }
      }

      logger.info('Expired sessions cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessionKeys = await redisService.keys('session:*');
      const activeSessions: SessionData[] = [];

      for (const key of sessionKeys) {
        const sessionData = await redisService.get(key);
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          if (session.userId === userId && session.isActive) {
            activeSessions.push(session);
          }
        }
      }

      return activeSessions;
    } catch (error) {
      logger.error(`Failed to get active sessions for user ${userId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private async storeSessionInRedis(session: SessionData): Promise<void> {
    const key = `session:${session.sessionId}`;
    const data = JSON.stringify(session);
    await redisService.set(key, data, this.SESSION_TTL);
  }

  private async getSessionFromRedis(sessionId: string): Promise<SessionData | null> {
    const key = `session:${sessionId}`;
    const data = await redisService.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async removeSessionFromRedis(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await redisService.del(key);
  }

  private async updateSessionInDatabase(session: SessionData): Promise<void> {
    try {
      // Update agent states individually
      for (const agentState of session.agentStates) {
        await this.sessionRepository.updateAgentState(session.sessionId, {
          agentId: agentState.agentId,
          agentType: agentState.agentType,
          sessionId: session.sessionId,
          context: agentState.context,
          lastAction: agentState.lastAction,
          status: agentState.status,
          capabilities: [],
          lastUpdated: agentState.lastUpdated
        });
      }
    } catch (error) {
      logger.error('Failed to update session in database:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const sessionService = new SessionService();