import { describe, it, expect, beforeEach } from 'vitest';
import { SessionRepositoryImpl, CreateSessionData } from '../../database/repositories/session.repository.js';
import { Message, AgentState } from '../../types/index.js';

describe('SessionRepository', () => {
  let sessionRepository: SessionRepositoryImpl;

  beforeEach(() => {
    sessionRepository = new SessionRepositoryImpl();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const sessionData: CreateSessionData = {
        userId: 'user123',
        currentTopic: 'supervised-learning'
      };

      const session = await sessionRepository.createSession(sessionData);

      expect(session).toBeDefined();
      expect(session.userId).toBe('user123');
      expect(session.currentTopic).toBe('supervised-learning');
      expect(session.startTime).toBeDefined();
      expect(session.endTime).toBeUndefined();
      expect(session.conversationHistory).toEqual([]);
      expect(session.agentStates).toEqual([]);
    });

    it('should create session with progress snapshot', async () => {
      const sessionData: CreateSessionData = {
        userId: 'user123',
        currentTopic: 'supervised-learning',
        progressSnapshot: {
          overallProgress: 25,
          currentTopic: 'supervised-learning',
          topicsCompleted: 2,
          totalTopics: 8,
          averageScore: 85,
          learningVelocity: 1.2,
          recommendedNextTopics: ['unsupervised-learning']
        }
      };

      const session = await sessionRepository.createSession(sessionData);

      expect(session.progressSnapshot.overallProgress).toBe(25);
      expect(session.progressSnapshot.topicsCompleted).toBe(2);
      expect(session.progressSnapshot.recommendedNextTopics).toEqual(['unsupervised-learning']);
    });

    it('should end existing active session when creating new one', async () => {
      const sessionData: CreateSessionData = {
        userId: 'user123',
        currentTopic: 'topic1'
      };

      const firstSession = await sessionRepository.createSession(sessionData);
      expect(firstSession.endTime).toBeUndefined();

      const secondSession = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'topic2'
      });

      expect(secondSession.endTime).toBeUndefined();
      
      // Check that first session was ended
      const foundFirstSession = await sessionRepository.findSessionById(firstSession.id);
      expect(foundFirstSession!.endTime).toBeDefined();
    });
  });

  describe('findActiveSession', () => {
    it('should find active session for user', async () => {
      const sessionData: CreateSessionData = {
        userId: 'user123',
        currentTopic: 'supervised-learning'
      };

      const created = await sessionRepository.createSession(sessionData);
      const active = await sessionRepository.findActiveSession('user123');

      expect(active).toBeDefined();
      expect(active!.id).toEqual(created.id);
      expect(active!.endTime).toBeUndefined();
    });

    it('should return null when no active session exists', async () => {
      const active = await sessionRepository.findActiveSession('user123');
      expect(active).toBeNull();
    });

    it('should return null when session is ended', async () => {
      const sessionData: CreateSessionData = {
        userId: 'user123',
        currentTopic: 'supervised-learning'
      };

      const session = await sessionRepository.createSession(sessionData);
      await sessionRepository.endSession(session.id);

      const active = await sessionRepository.findActiveSession('user123');
      expect(active).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add message to session', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const message: Message = {
        id: 'msg1',
        sender: 'student',
        content: 'What is supervised learning?',
        timestamp: new Date(),
        metadata: {
          messageType: 'question',
          topicId: 'supervised-learning'
        }
      };

      const updated = await sessionRepository.addMessage(session.id, message);

      expect(updated).toBeDefined();
      expect(updated!.conversationHistory).toHaveLength(1);
      expect(updated!.conversationHistory[0].content).toBe('What is supervised learning?');
      expect(updated!.conversationHistory[0].sender).toBe('student');
    });

    it('should return null for non-existent session', async () => {
      const message: Message = {
        id: 'msg1',
        sender: 'student',
        content: 'Test message',
        timestamp: new Date(),
        metadata: {
          messageType: 'question'
        }
      };

      const result = await sessionRepository.addMessage('507f1f77bcf86cd799439011', message);
      expect(result).toBeNull();
    });
  });

  describe('addMessages', () => {
    it('should add multiple messages to session', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const messages: Message[] = [
        {
          id: 'msg1',
          sender: 'student',
          content: 'What is supervised learning?',
          timestamp: new Date(),
          metadata: { messageType: 'question' }
        },
        {
          id: 'msg2',
          sender: 'tutor',
          content: 'Supervised learning is...',
          timestamp: new Date(),
          metadata: { messageType: 'explanation' }
        }
      ];

      const updated = await sessionRepository.addMessages(session.id, messages);

      expect(updated).toBeDefined();
      expect(updated!.conversationHistory).toHaveLength(2);
      expect(updated!.conversationHistory[0].sender).toBe('student');
      expect(updated!.conversationHistory[1].sender).toBe('tutor');
    });
  });

  describe('updateAgentState', () => {
    it('should add new agent state', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const agentState: AgentState = {
        agentId: 'tutor-agent',
        sessionId: session.id,
        context: { currentTopic: 'supervised-learning', difficulty: 5 },
        lastAction: 'explain-concept',
        status: 'active',
        capabilities: ['explain', 'question', 'assess']
      };

      const updated = await sessionRepository.updateAgentState(session.id, agentState);

      expect(updated).toBeDefined();
      expect(updated!.agentStates).toHaveLength(1);
      expect(updated!.agentStates[0].agentId).toBe('tutor-agent');
      expect(updated!.agentStates[0].status).toBe('active');
    });

    it('should update existing agent state', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const agentState: AgentState = {
        agentId: 'tutor-agent',
        sessionId: session.id,
        context: { currentTopic: 'supervised-learning' },
        lastAction: 'explain-concept',
        status: 'active',
        capabilities: ['explain']
      };

      await sessionRepository.updateAgentState(session.id, agentState);

      // Update the same agent
      const updatedAgentState: AgentState = {
        agentId: 'tutor-agent',
        sessionId: session.id,
        context: { currentTopic: 'supervised-learning', difficulty: 8 },
        lastAction: 'generate-question',
        status: 'idle',
        capabilities: ['explain', 'question']
      };

      const result = await sessionRepository.updateAgentState(session.id, updatedAgentState);

      expect(result).toBeDefined();
      expect(result!.agentStates).toHaveLength(1);
      expect(result!.agentStates[0].lastAction).toBe('generate-question');
      expect(result!.agentStates[0].status).toBe('idle');
      expect(result!.agentStates[0].context.difficulty).toBe(8);
    });
  });

  describe('getConversationHistory', () => {
    it('should return conversation history', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const messages: Message[] = [
        {
          id: 'msg1',
          sender: 'student',
          content: 'Message 1',
          timestamp: new Date(),
          metadata: { messageType: 'question' }
        },
        {
          id: 'msg2',
          sender: 'tutor',
          content: 'Message 2',
          timestamp: new Date(),
          metadata: { messageType: 'explanation' }
        },
        {
          id: 'msg3',
          sender: 'student',
          content: 'Message 3',
          timestamp: new Date(),
          metadata: { messageType: 'question' }
        }
      ];

      await sessionRepository.addMessages(session.id, messages);

      const history = await sessionRepository.getConversationHistory(session.id);

      expect(history).toHaveLength(3);
      expect(history.map(m => m.content)).toEqual(['Message 1', 'Message 2', 'Message 3']);
    });

    it('should respect limit parameter', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      const messages: Message[] = Array.from({ length: 5 }, (_, i) => ({
        id: `msg${i + 1}`,
        sender: 'student' as const,
        content: `Message ${i + 1}`,
        timestamp: new Date(),
        metadata: { messageType: 'question' as const }
      }));

      await sessionRepository.addMessages(session.id, messages);

      const history = await sessionRepository.getConversationHistory(session.id, 3);

      expect(history).toHaveLength(3);
      expect(history.map(m => m.content)).toEqual(['Message 3', 'Message 4', 'Message 5']);
    });

    it('should return empty array for non-existent session', async () => {
      const history = await sessionRepository.getConversationHistory('507f1f77bcf86cd799439011');
      expect(history).toEqual([]);
    });
  });

  describe('getSessionStats', () => {
    it('should return session statistics', async () => {
      // Create multiple sessions
      const session1 = await sessionRepository.createSession({
        userId: 'user1',
        currentTopic: 'topic1'
      });

      const session2 = await sessionRepository.createSession({
        userId: 'user2',
        currentTopic: 'topic2'
      });

      // Add messages to sessions
      await sessionRepository.addMessage(session1.id, {
        id: 'msg1',
        sender: 'student',
        content: 'Test',
        timestamp: new Date(),
        metadata: { messageType: 'question' }
      });

      await sessionRepository.addMessage(session2.id, {
        id: 'msg2',
        sender: 'tutor',
        content: 'Response',
        timestamp: new Date(),
        metadata: { messageType: 'explanation' }
      });

      // End one session
      await sessionRepository.endSession(session1.id);

      const stats = await sessionRepository.getSessionStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(1); // At least 1 message
      expect(stats.averageSessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should return stats for specific user', async () => {
      await sessionRepository.createSession({
        userId: 'user1',
        currentTopic: 'topic1'
      });

      await sessionRepository.createSession({
        userId: 'user2',
        currentTopic: 'topic2'
      });

      const stats = await sessionRepository.getSessionStats('user1');

      expect(stats.totalSessions).toBe(1);
      expect(stats.activeSessions).toBe(1);
    });
  });

  describe('endSession', () => {
    it('should end active session', async () => {
      const session = await sessionRepository.createSession({
        userId: 'user123',
        currentTopic: 'supervised-learning'
      });

      expect(session.endTime).toBeUndefined();

      const ended = await sessionRepository.endSession(session.id);

      expect(ended).toBeDefined();
      expect(ended!.endTime).toBeDefined();
    });

    it('should return null for non-existent session', async () => {
      const result = await sessionRepository.endSession('507f1f77bcf86cd799439011');
      expect(result).toBeNull();
    });
  });
});