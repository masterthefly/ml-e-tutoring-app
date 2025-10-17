import { FilterQuery } from 'mongoose';
import { AbstractRepository } from './base.repository.js';
import { SessionDocument, SessionModel } from '../schemas/session.schema.js';
import { LearningSession, Message, AgentState, ProgressData } from '../../types/index.js';

export interface CreateSessionData {
  userId: string;
  currentTopic: string;
  progressSnapshot?: ProgressData;
}

export interface SessionRepository {
  // Session management
  createSession(sessionData: CreateSessionData): Promise<LearningSession>;
  endSession(sessionId: string): Promise<LearningSession | null>;
  findActiveSession(userId: string): Promise<LearningSession | null>;
  findSessionById(sessionId: string): Promise<LearningSession | null>;
  
  // Conversation persistence
  addMessage(sessionId: string, message: Message): Promise<LearningSession | null>;
  addMessages(sessionId: string, messages: Message[]): Promise<LearningSession | null>;
  getConversationHistory(sessionId: string, limit?: number): Promise<Message[]>;
  
  // Agent state management
  updateAgentState(sessionId: string, agentState: AgentState): Promise<LearningSession | null>;
  getAgentStates(sessionId: string): Promise<AgentState[]>;
  clearAgentState(sessionId: string, agentId: string): Promise<LearningSession | null>;
  
  // Session queries
  findUserSessions(userId: string, limit?: number): Promise<LearningSession[]>;
  findSessionsByTopic(topic: string, limit?: number): Promise<LearningSession[]>;
  findSessionsByDateRange(startDate: Date, endDate: Date): Promise<LearningSession[]>;
  
  // Analytics queries
  getSessionStats(userId?: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    totalMessages: number;
  }>;
  getTopicEngagement(): Promise<Array<{ topic: string; sessionCount: number; averageDuration: number }>>;
}

export class SessionRepositoryImpl extends AbstractRepository<SessionDocument> implements SessionRepository {
  constructor() {
    super(SessionModel);
  }

  async createSession(sessionData: CreateSessionData): Promise<LearningSession> {
    // End any existing active session for the user
    await this.model.updateMany(
      { userId: sessionData.userId, endTime: { $exists: false } },
      { endTime: new Date() }
    );

    const sessionDoc = await this.create({
      userId: sessionData.userId,
      currentTopic: sessionData.currentTopic,
      startTime: new Date(),
      conversationHistory: [],
      agentStates: [],
      progressSnapshot: sessionData.progressSnapshot || {
        overallProgress: 0,
        currentTopic: sessionData.currentTopic,
        topicsCompleted: 0,
        totalTopics: 0,
        averageScore: 0,
        learningVelocity: 0,
        recommendedNextTopics: []
      }
    } as Partial<SessionDocument>);

    return this.documentToSession(sessionDoc);
  }

  async endSession(sessionId: string): Promise<LearningSession | null> {
    const sessionDoc = await this.updateById(sessionId, {
      endTime: new Date(),
      'agentStates.$[].status': 'idle'
    });

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async findActiveSession(userId: string): Promise<LearningSession | null> {
    const sessionDoc = await this.findOne({
      userId,
      endTime: { $exists: false }
    });

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async findSessionById(sessionId: string): Promise<LearningSession | null> {
    const sessionDoc = await this.findById(sessionId);
    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async addMessage(sessionId: string, message: Message): Promise<LearningSession | null> {
    const sessionDoc = await this.updateById(sessionId, {
      $push: { conversationHistory: message }
    });

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async addMessages(sessionId: string, messages: Message[]): Promise<LearningSession | null> {
    const sessionDoc = await this.updateById(sessionId, {
      $push: { conversationHistory: { $each: messages } }
    });

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async getConversationHistory(sessionId: string, limit?: number): Promise<Message[]> {
    const sessionDoc = await this.findById(sessionId);
    
    if (!sessionDoc) {
      return [];
    }

    const history = sessionDoc.conversationHistory;
    
    if (limit && limit > 0) {
      return history.slice(-limit);
    }
    
    return history;
  }

  async updateAgentState(sessionId: string, agentState: AgentState): Promise<LearningSession | null> {
    // First try to update existing agent state
    let sessionDoc = await this.model.findOneAndUpdate(
      { 
        _id: sessionId,
        'agentStates.agentId': agentState.agentId 
      },
      {
        $set: {
          'agentStates.$.context': agentState.context,
          'agentStates.$.lastAction': agentState.lastAction,
          'agentStates.$.status': agentState.status,
          'agentStates.$.capabilities': agentState.capabilities
        }
      },
      { new: true }
    ).exec();

    // If no existing agent state found, add new one
    if (!sessionDoc) {
      sessionDoc = await this.model.findByIdAndUpdate(
        sessionId,
        { $push: { agentStates: agentState } },
        { new: true }
      ).exec();
    }

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async getAgentStates(sessionId: string): Promise<AgentState[]> {
    const sessionDoc = await this.findById(sessionId);
    return sessionDoc ? sessionDoc.agentStates : [];
  }

  async clearAgentState(sessionId: string, agentId: string): Promise<LearningSession | null> {
    const sessionDoc = await this.updateById(sessionId, {
      $pull: { agentStates: { agentId } }
    });

    return sessionDoc ? this.documentToSession(sessionDoc) : null;
  }

  async findUserSessions(userId: string, limit: number = 50): Promise<LearningSession[]> {
    const sessionDocs = await this.findMany(
      { userId },
      {
        sort: { startTime: -1 },
        limit
      }
    );

    return sessionDocs.map(doc => this.documentToSession(doc));
  }

  async findSessionsByTopic(topic: string, limit: number = 50): Promise<LearningSession[]> {
    const sessionDocs = await this.findMany(
      { currentTopic: topic },
      {
        sort: { startTime: -1 },
        limit
      }
    );

    return sessionDocs.map(doc => this.documentToSession(doc));
  }

  async findSessionsByDateRange(startDate: Date, endDate: Date): Promise<LearningSession[]> {
    const sessionDocs = await this.findMany({
      startTime: {
        $gte: startDate,
        $lte: endDate
      }
    }, {
      sort: { startTime: -1 }
    });

    return sessionDocs.map(doc => this.documentToSession(doc));
  }

  async getSessionStats(userId?: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    totalMessages: number;
  }> {
    const filter: FilterQuery<SessionDocument> = userId ? { userId } : {};

    const [totalSessions, activeSessions] = await Promise.all([
      this.count(filter),
      this.count({ ...filter, endTime: { $exists: false } })
    ]);

    // Calculate average session duration and total messages using aggregation
    const stats = await this.model.aggregate([
      { $match: { ...filter, endTime: { $exists: true } } },
      {
        $project: {
          duration: { $subtract: ['$endTime', '$startTime'] },
          messageCount: { $size: '$conversationHistory' }
        }
      },
      {
        $group: {
          _id: null,
          averageDuration: { $avg: '$duration' },
          totalMessages: { $sum: '$messageCount' }
        }
      }
    ]);

    const averageSessionDuration = stats.length > 0 ? Math.round(stats[0].averageDuration / 1000 / 60) : 0; // Convert to minutes
    const totalMessages = stats.length > 0 ? stats[0].totalMessages : 0;

    return {
      totalSessions,
      activeSessions,
      averageSessionDuration,
      totalMessages
    };
  }

  async getTopicEngagement(): Promise<Array<{ topic: string; sessionCount: number; averageDuration: number }>> {
    const engagement = await this.model.aggregate([
      {
        $match: {
          endTime: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$currentTopic',
          sessionCount: { $sum: 1 },
          averageDuration: {
            $avg: { $subtract: ['$endTime', '$startTime'] }
          }
        }
      },
      {
        $project: {
          topic: '$_id',
          sessionCount: 1,
          averageDuration: { $round: [{ $divide: ['$averageDuration', 60000] }, 2] } // Convert to minutes
        }
      },
      {
        $sort: { sessionCount: -1 }
      }
    ]);

    return engagement.map((item: any) => ({
      topic: item.topic,
      sessionCount: item.sessionCount,
      averageDuration: item.averageDuration
    }));
  }

  private documentToSession(doc: SessionDocument): LearningSession {
    return {
      id: doc._id,
      userId: doc.userId,
      startTime: doc.startTime,
      endTime: doc.endTime,
      currentTopic: doc.currentTopic,
      conversationHistory: doc.conversationHistory,
      agentStates: doc.agentStates,
      progressSnapshot: doc.progressSnapshot
    };
  }
}