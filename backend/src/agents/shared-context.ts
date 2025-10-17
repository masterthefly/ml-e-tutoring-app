import { EventEmitter } from 'events';
import { AgentType, LearningSession, StudentProgress, Message } from '../types/index.js';
import { RedisService } from '../services/redis.service.js';
import { logger } from '../utils/logger.js';

export interface SharedContextData {
  sessionId: string;
  userId: string;
  currentTopic: string;
  conversationHistory: Message[];
  studentProgress: StudentProgress;
  agentStates: Map<string, AgentContextState>;
  learningObjectives: string[];
  currentDifficulty: number;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export interface AgentContextState {
  agentId: string;
  agentType: AgentType;
  lastAction: string;
  context: Record<string, any>;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'error';
  lastUpdated: Date;
}

export interface ContextUpdate {
  sessionId: string;
  agentId: string;
  updateType: 'message' | 'progress' | 'topic' | 'difficulty' | 'metadata' | 'agent_state';
  data: any;
  timestamp: Date;
}

export interface ContextQuery {
  sessionId?: string;
  userId?: string;
  agentId?: string;
  topic?: string;
  timeRange?: { start: Date; end: Date };
}

export class SharedContextManager extends EventEmitter {
  private redisService: RedisService;
  private contexts: Map<string, SharedContextData> = new Map();
  private contextLocks: Map<string, boolean> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL = 5000; // 5 seconds
  private readonly CONTEXT_TTL = 3600; // 1 hour in seconds

  constructor(redisService: RedisService) {
    super();
    this.redisService = redisService;
    this.startPeriodicSync();
  }

  /**
   * Initialize context for a new session
   */
  public async initializeContext(
    sessionId: string,
    userId: string,
    initialProgress?: StudentProgress
  ): Promise<SharedContextData> {
    const contextData: SharedContextData = {
      sessionId,
      userId,
      currentTopic: '',
      conversationHistory: [],
      studentProgress: initialProgress || this.createEmptyProgress(userId),
      agentStates: new Map(),
      learningObjectives: [],
      currentDifficulty: 1,
      lastActivity: new Date(),
      metadata: {}
    };

    // Store in memory
    this.contexts.set(sessionId, contextData);

    // Persist to Redis
    await this.persistContext(sessionId, contextData);

    logger.info(`Initialized shared context for session ${sessionId}`);
    this.emit('context:initialized', { sessionId, userId });

    return contextData;
  }

  /**
   * Get context for a session
   */
  public async getContext(sessionId: string): Promise<SharedContextData | undefined> {
    // Check memory first
    let contextData = this.contexts.get(sessionId);
    
    if (!contextData) {
      // Try to load from Redis
      contextData = await this.loadContext(sessionId);
      if (contextData) {
        this.contexts.set(sessionId, contextData);
      }
    }

    return contextData;
  }

  /**
   * Update context with new data
   */
  public async updateContext(update: ContextUpdate): Promise<void> {
    const { sessionId, agentId, updateType, data, timestamp } = update;

    // Acquire lock for this session
    await this.acquireLock(sessionId);

    try {
      let contextData = await this.getContext(sessionId);
      if (!contextData) {
        throw new Error(`Context not found for session ${sessionId}`);
      }

      // Apply update based on type
      switch (updateType) {
        case 'message':
          this.updateConversationHistory(contextData, data as Message);
          break;
        
        case 'progress':
          this.updateStudentProgress(contextData, data);
          break;
        
        case 'topic':
          this.updateCurrentTopic(contextData, data as string);
          break;
        
        case 'difficulty':
          this.updateDifficulty(contextData, data as number);
          break;
        
        case 'metadata':
          this.updateMetadata(contextData, data);
          break;
        
        case 'agent_state':
          this.updateAgentStateInternal(contextData, agentId, data);
          break;
        
        default:
          logger.warn(`Unknown update type: ${updateType}`);
      }

      // Update last activity
      contextData.lastActivity = timestamp;

      // Persist changes
      await this.persistContext(sessionId, contextData);

      logger.debug(`Updated context for session ${sessionId}: ${updateType}`);
      this.emit('context:updated', update);

    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * Add message to conversation history
   */
  public async addMessage(sessionId: string, message: Message): Promise<void> {
    const update: ContextUpdate = {
      sessionId,
      agentId: message.metadata.agentId || 'unknown',
      updateType: 'message',
      data: message,
      timestamp: new Date()
    };

    await this.updateContext(update);
  }

  /**
   * Update agent state in context
   */
  public async updateAgentState(
    sessionId: string,
    agentId: string,
    agentState: Partial<AgentContextState>
  ): Promise<void> {
    const update: ContextUpdate = {
      sessionId,
      agentId,
      updateType: 'agent_state',
      data: agentState,
      timestamp: new Date()
    };

    await this.updateContext(update);
  }

  /**
   * Get conversation history for a session
   */
  public async getConversationHistory(
    sessionId: string,
    limit?: number
  ): Promise<Message[]> {
    const contextData = await this.getContext(sessionId);
    if (!contextData) {
      return [];
    }

    const history = contextData.conversationHistory;
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get agent states for a session
   */
  public async getAgentStates(sessionId: string): Promise<Map<string, AgentContextState>> {
    const contextData = await this.getContext(sessionId);
    return contextData?.agentStates || new Map();
  }

  /**
   * Get student progress for a session
   */
  public async getStudentProgress(sessionId: string): Promise<StudentProgress | null> {
    const contextData = await this.getContext(sessionId);
    return contextData?.studentProgress || null;
  }

  /**
   * Search contexts based on query
   */
  public async searchContexts(query: ContextQuery): Promise<SharedContextData[]> {
    const results: SharedContextData[] = [];

    // Search in memory contexts
    for (const contextData of this.contexts.values()) {
      if (this.matchesQuery(contextData, query)) {
        results.push(contextData);
      }
    }

    // If searching by sessionId and not found in memory, try Redis
    if (query.sessionId && results.length === 0) {
      const contextData = await this.loadContext(query.sessionId);
      if (contextData && this.matchesQuery(contextData, query)) {
        results.push(contextData);
      }
    }

    return results;
  }

  /**
   * Clean up expired contexts
   */
  public async cleanupExpiredContexts(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, contextData] of this.contexts) {
      const timeSinceLastActivity = now.getTime() - contextData.lastActivity.getTime();
      if (timeSinceLastActivity > this.CONTEXT_TTL * 1000) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.removeContext(sessionId);
    }

    if (expiredSessions.length > 0) {
      logger.info(`Cleaned up ${expiredSessions.length} expired contexts`);
    }
  }

  /**
   * Remove context for a session
   */
  public async removeContext(sessionId: string): Promise<void> {
    // Remove from memory
    this.contexts.delete(sessionId);

    // Remove from Redis
    await this.redisService.del(`context:${sessionId}`);

    logger.info(`Removed context for session ${sessionId}`);
    this.emit('context:removed', { sessionId });
  }

  /**
   * Get context statistics
   */
  public getStatistics(): {
    activeContexts: number;
    totalMessages: number;
    averageSessionLength: number;
    agentActivity: Record<AgentType, number>;
  } {
    const stats = {
      activeContexts: this.contexts.size,
      totalMessages: 0,
      averageSessionLength: 0,
      agentActivity: {} as Record<AgentType, number>
    };

    let totalSessionTime = 0;

    for (const contextData of this.contexts.values()) {
      stats.totalMessages += contextData.conversationHistory.length;
      
      const sessionLength = Date.now() - new Date(contextData.lastActivity).getTime();
      totalSessionTime += sessionLength;

      // Count agent activity
      for (const agentState of contextData.agentStates.values()) {
        if (!stats.agentActivity[agentState.agentType]) {
          stats.agentActivity[agentState.agentType] = 0;
        }
        stats.agentActivity[agentState.agentType]++;
      }
    }

    if (this.contexts.size > 0) {
      stats.averageSessionLength = totalSessionTime / this.contexts.size;
    }

    return stats;
  }

  /**
   * Persist context to Redis
   */
  private async persistContext(sessionId: string, contextData: SharedContextData): Promise<void> {
    try {
      // Convert Map to object for serialization
      const serializedData = {
        ...contextData,
        agentStates: Object.fromEntries(contextData.agentStates)
      };

      await this.redisService.set(
        `context:${sessionId}`,
        JSON.stringify(serializedData),
        this.CONTEXT_TTL
      );
    } catch (error) {
      logger.error(`Failed to persist context for session ${sessionId}:`, error);
    }
  }

  /**
   * Load context from Redis
   */
  private async loadContext(sessionId: string): Promise<SharedContextData | undefined> {
    try {
      const data = await this.redisService.get(`context:${sessionId}`);
      if (!data) {
        return undefined;
      }

      const parsedData = JSON.parse(data);
      
      // Convert object back to Map
      const contextData: SharedContextData = {
        ...parsedData,
        agentStates: new Map(Object.entries(parsedData.agentStates || {})),
        lastActivity: new Date(parsedData.lastActivity)
      };

      return contextData;
    } catch (error) {
      logger.error(`Failed to load context for session ${sessionId}:`, error);
      return undefined;
    }
  }

  /**
   * Update conversation history
   */
  private updateConversationHistory(contextData: SharedContextData, message: Message): void {
    contextData.conversationHistory.push(message);
    
    // Keep only recent messages to prevent memory bloat
    const maxMessages = 100;
    if (contextData.conversationHistory.length > maxMessages) {
      contextData.conversationHistory = contextData.conversationHistory.slice(-maxMessages);
    }
  }

  /**
   * Update student progress
   */
  private updateStudentProgress(contextData: SharedContextData, progressUpdate: Partial<StudentProgress>): void {
    contextData.studentProgress = {
      ...contextData.studentProgress,
      ...progressUpdate,
      lastUpdated: new Date()
    };
  }

  /**
   * Update current topic
   */
  private updateCurrentTopic(contextData: SharedContextData, topic: string): void {
    contextData.currentTopic = topic;
  }

  /**
   * Update difficulty level
   */
  private updateDifficulty(contextData: SharedContextData, difficulty: number): void {
    contextData.currentDifficulty = Math.max(1, Math.min(10, difficulty));
  }

  /**
   * Update metadata
   */
  private updateMetadata(contextData: SharedContextData, metadata: Record<string, any>): void {
    contextData.metadata = { ...contextData.metadata, ...metadata };
  }

  /**
   * Update agent state (internal)
   */
  private updateAgentStateInternal(
    contextData: SharedContextData,
    agentId: string,
    stateUpdate: Partial<AgentContextState>
  ): void {
    const existingState = contextData.agentStates.get(agentId);
    
    const updatedState: AgentContextState = {
      agentId,
      agentType: stateUpdate.agentType || existingState?.agentType || 'tutor',
      lastAction: stateUpdate.lastAction || existingState?.lastAction || 'initialized',
      context: { ...existingState?.context, ...stateUpdate.context },
      capabilities: stateUpdate.capabilities || existingState?.capabilities || [],
      status: stateUpdate.status || existingState?.status || 'active',
      lastUpdated: new Date()
    };

    contextData.agentStates.set(agentId, updatedState);
  }

  /**
   * Create empty progress for new user
   */
  private createEmptyProgress(userId: string): StudentProgress {
    return {
      userId,
      topicsCompleted: [],
      currentLevel: 1,
      totalTimeSpent: 0,
      assessmentScores: [],
      learningPath: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Check if context matches query
   */
  private matchesQuery(contextData: SharedContextData, query: ContextQuery): boolean {
    if (query.sessionId && contextData.sessionId !== query.sessionId) {
      return false;
    }

    if (query.userId && contextData.userId !== query.userId) {
      return false;
    }

    if (query.topic && contextData.currentTopic !== query.topic) {
      return false;
    }

    if (query.agentId && !contextData.agentStates.has(query.agentId)) {
      return false;
    }

    if (query.timeRange) {
      const lastActivity = contextData.lastActivity.getTime();
      if (lastActivity < query.timeRange.start.getTime() || 
          lastActivity > query.timeRange.end.getTime()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Acquire lock for session
   */
  private async acquireLock(sessionId: string): Promise<void> {
    while (this.contextLocks.get(sessionId)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.contextLocks.set(sessionId, true);
  }

  /**
   * Release lock for session
   */
  private releaseLock(sessionId: string): void {
    this.contextLocks.delete(sessionId);
  }

  /**
   * Start periodic sync with Redis
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredContexts();
      } catch (error) {
        logger.error('Error during periodic context cleanup:', error);
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * Stop periodic sync
   */
  public stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Cleanup all resources
   */
  public async cleanup(): Promise<void> {
    this.stopPeriodicSync();
    this.contexts.clear();
    this.contextLocks.clear();
    this.removeAllListeners();
  }
}