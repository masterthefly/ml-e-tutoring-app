import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressRepositoryImpl, CreateProgressData, TopicProgressUpdate } from '../../database/repositories/progress.repository.js';
import { AssessmentResult } from '../../types/index.js';

describe('ProgressRepository', () => {
  let progressRepository: ProgressRepositoryImpl;

  beforeEach(() => {
    progressRepository = new ProgressRepositoryImpl();
  });

  describe('createProgress', () => {
    it('should create new progress record', async () => {
      const progressData: CreateProgressData = {
        userId: 'user123',
        initialTopic: 'supervised-learning',
        initialLevel: 1
      };

      const progress = await progressRepository.createProgress(progressData);

      expect(progress).toBeDefined();
      expect(progress.userId).toBe('user123');
      expect(progress.currentLevel).toBe(1);
      expect(progress.totalTimeSpent).toBe(0);
      expect(progress.topicsCompleted).toHaveLength(1);
      expect(progress.topicsCompleted[0].topicId).toBe('supervised-learning');
      expect(progress.assessmentScores).toEqual([]);
      expect(progress.learningPath).toEqual([]);
    });

    it('should create progress without initial topic', async () => {
      const progressData: CreateProgressData = {
        userId: 'user123'
      };

      const progress = await progressRepository.createProgress(progressData);

      expect(progress.userId).toBe('user123');
      expect(progress.currentLevel).toBe(1);
      expect(progress.topicsCompleted).toEqual([]);
    });

    it('should throw error for duplicate user', async () => {
      const progressData: CreateProgressData = {
        userId: 'user123'
      };

      await progressRepository.createProgress(progressData);

      await expect(progressRepository.createProgress(progressData))
        .rejects.toThrow('Progress already exists for this user');
    });
  });

  describe('findByUserId', () => {
    it('should find progress by user ID', async () => {
      const progressData: CreateProgressData = {
        userId: 'user123',
        initialTopic: 'supervised-learning'
      };

      await progressRepository.createProgress(progressData);

      const found = await progressRepository.findByUserId('user123');

      expect(found).toBeDefined();
      expect(found!.userId).toBe('user123');
      expect(found!.topicsCompleted).toHaveLength(1);
    });

    it('should return null for non-existent user', async () => {
      const result = await progressRepository.findByUserId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateTopicProgress', () => {
    it('should add new topic progress', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const topicUpdate: TopicProgressUpdate = {
        topicId: 'supervised-learning',
        topicName: 'Supervised Learning',
        completionPercentage: 50,
        masteryLevel: 'intermediate',
        timeSpent: 1800,
        conceptsLearned: ['classification', 'regression'],
        strugglingConcepts: ['overfitting']
      };

      const updated = await progressRepository.updateTopicProgress('user123', topicUpdate);

      expect(updated).toBeDefined();
      expect(updated!.topicsCompleted).toHaveLength(1);
      expect(updated!.topicsCompleted[0].topicId).toBe('supervised-learning');
      expect(updated!.topicsCompleted[0].completionPercentage).toBe(50);
      expect(updated!.topicsCompleted[0].masteryLevel).toBe('intermediate');
      expect(updated!.topicsCompleted[0].conceptsLearned).toEqual(['classification', 'regression']);
    });

    it('should update existing topic progress', async () => {
      await progressRepository.createProgress({ 
        userId: 'user123',
        initialTopic: 'supervised-learning'
      });

      const firstUpdate: TopicProgressUpdate = {
        topicId: 'supervised-learning',
        topicName: 'Supervised Learning',
        completionPercentage: 30,
        masteryLevel: 'beginner'
      };

      await progressRepository.updateTopicProgress('user123', firstUpdate);

      const secondUpdate: TopicProgressUpdate = {
        topicId: 'supervised-learning',
        topicName: 'Supervised Learning',
        completionPercentage: 80,
        masteryLevel: 'advanced',
        timeSpent: 3600
      };

      const updated = await progressRepository.updateTopicProgress('user123', secondUpdate);

      expect(updated).toBeDefined();
      expect(updated!.topicsCompleted).toHaveLength(1);
      expect(updated!.topicsCompleted[0].completionPercentage).toBe(80);
      expect(updated!.topicsCompleted[0].masteryLevel).toBe('advanced');
      expect(updated!.topicsCompleted[0].timeSpent).toBe(3600);
    });

    it('should return null for non-existent user', async () => {
      const topicUpdate: TopicProgressUpdate = {
        topicId: 'test-topic',
        topicName: 'Test Topic'
      };

      const result = await progressRepository.updateTopicProgress('nonexistent', topicUpdate);
      expect(result).toBeNull();
    });
  });

  describe('addAssessmentResult', () => {
    it('should add assessment result', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const assessment: AssessmentResult = {
        id: 'assessment1',
        topicId: 'supervised-learning',
        score: 8,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 600,
        questionResults: [],
        difficulty: 5
      };

      const updated = await progressRepository.addAssessmentResult('user123', assessment);

      expect(updated).toBeDefined();
      expect(updated!.assessmentScores).toHaveLength(1);
      expect(updated!.assessmentScores[0].id).toBe('assessment1');
      expect(updated!.assessmentScores[0].score).toBe(8);
      expect(updated!.assessmentScores[0].maxScore).toBe(10);
    });

    it('should return null for non-existent user', async () => {
      const assessment: AssessmentResult = {
        id: 'assessment1',
        topicId: 'test-topic',
        score: 5,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 300,
        questionResults: [],
        difficulty: 3
      };

      const result = await progressRepository.addAssessmentResult('nonexistent', assessment);
      expect(result).toBeNull();
    });
  });

  describe('getAssessmentHistory', () => {
    it('should return assessment history for user', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const assessment1: AssessmentResult = {
        id: 'assessment1',
        topicId: 'supervised-learning',
        score: 7,
        maxScore: 10,
        completedAt: new Date('2023-01-01'),
        timeSpent: 600,
        questionResults: [],
        difficulty: 5
      };

      const assessment2: AssessmentResult = {
        id: 'assessment2',
        topicId: 'unsupervised-learning',
        score: 9,
        maxScore: 10,
        completedAt: new Date('2023-01-02'),
        timeSpent: 800,
        questionResults: [],
        difficulty: 6
      };

      await progressRepository.addAssessmentResult('user123', assessment1);
      await progressRepository.addAssessmentResult('user123', assessment2);

      const history = await progressRepository.getAssessmentHistory('user123');

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('assessment2'); // Most recent first
      expect(history[1].id).toBe('assessment1');
    });

    it('should filter by topic ID', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const assessment1: AssessmentResult = {
        id: 'assessment1',
        topicId: 'supervised-learning',
        score: 7,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 600,
        questionResults: [],
        difficulty: 5
      };

      const assessment2: AssessmentResult = {
        id: 'assessment2',
        topicId: 'unsupervised-learning',
        score: 9,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 800,
        questionResults: [],
        difficulty: 6
      };

      await progressRepository.addAssessmentResult('user123', assessment1);
      await progressRepository.addAssessmentResult('user123', assessment2);

      const history = await progressRepository.getAssessmentHistory('user123', 'supervised-learning');

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('assessment1');
      expect(history[0].topicId).toBe('supervised-learning');
    });

    it('should return empty array for non-existent user', async () => {
      const history = await progressRepository.getAssessmentHistory('nonexistent');
      expect(history).toEqual([]);
    });
  });

  describe('getLatestAssessment', () => {
    it('should return latest assessment for topic', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const assessment1: AssessmentResult = {
        id: 'assessment1',
        topicId: 'supervised-learning',
        score: 7,
        maxScore: 10,
        completedAt: new Date('2023-01-01'),
        timeSpent: 600,
        questionResults: [],
        difficulty: 5
      };

      const assessment2: AssessmentResult = {
        id: 'assessment2',
        topicId: 'supervised-learning',
        score: 9,
        maxScore: 10,
        completedAt: new Date('2023-01-02'),
        timeSpent: 800,
        questionResults: [],
        difficulty: 6
      };

      await progressRepository.addAssessmentResult('user123', assessment1);
      await progressRepository.addAssessmentResult('user123', assessment2);

      const latest = await progressRepository.getLatestAssessment('user123', 'supervised-learning');

      expect(latest).toBeDefined();
      expect(latest!.id).toBe('assessment2');
      expect(latest!.score).toBe(9);
    });

    it('should return null when no assessments exist for topic', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const latest = await progressRepository.getLatestAssessment('user123', 'nonexistent-topic');
      expect(latest).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const latest = await progressRepository.getLatestAssessment('nonexistent', 'any-topic');
      expect(latest).toBeNull();
    });
  });

  describe('addTimeSpent', () => {
    it('should add time to total time spent', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const updated = await progressRepository.addTimeSpent('user123', 1800);

      expect(updated).toBeDefined();
      expect(updated!.totalTimeSpent).toBe(1800);

      // Add more time
      const updated2 = await progressRepository.addTimeSpent('user123', 600);
      expect(updated2!.totalTimeSpent).toBe(2400);
    });

    it('should return null for non-existent user', async () => {
      const result = await progressRepository.addTimeSpent('nonexistent', 1800);
      expect(result).toBeNull();
    });
  });

  describe('updateLearningPath', () => {
    it('should update learning path', async () => {
      await progressRepository.createProgress({ userId: 'user123' });

      const learningPath = ['supervised-learning', 'unsupervised-learning', 'neural-networks'];
      const updated = await progressRepository.updateLearningPath('user123', learningPath);

      expect(updated).toBeDefined();
      expect(updated!.learningPath).toEqual(learningPath);
    });

    it('should return null for non-existent user', async () => {
      const result = await progressRepository.updateLearningPath('nonexistent', ['topic1']);
      expect(result).toBeNull();
    });
  });

  describe('advanceLevel', () => {
    it('should advance user level', async () => {
      await progressRepository.createProgress({ 
        userId: 'user123',
        initialLevel: 3
      });

      const updated = await progressRepository.advanceLevel('user123');

      expect(updated).toBeDefined();
      expect(updated!.currentLevel).toBe(4);

      // Advance again
      const updated2 = await progressRepository.advanceLevel('user123');
      expect(updated2!.currentLevel).toBe(5);
    });

    it('should return null for non-existent user', async () => {
      const result = await progressRepository.advanceLevel('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getProgressStats', () => {
    it('should return progress statistics', async () => {
      // Create progress for multiple users
      await progressRepository.createProgress({ userId: 'user1' });
      await progressRepository.createProgress({ userId: 'user2' });

      // Add topic progress
      await progressRepository.updateTopicProgress('user1', {
        topicId: 'topic1',
        topicName: 'Topic 1',
        completionPercentage: 80
      });

      await progressRepository.updateTopicProgress('user2', {
        topicId: 'topic1',
        topicName: 'Topic 1',
        completionPercentage: 60
      });

      // Add assessments
      await progressRepository.addAssessmentResult('user1', {
        id: 'assessment1',
        topicId: 'topic1',
        score: 8,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 600,
        questionResults: [],
        difficulty: 5
      });

      await progressRepository.addAssessmentResult('user2', {
        id: 'assessment2',
        topicId: 'topic1',
        score: 6,
        maxScore: 10,
        completedAt: new Date(),
        timeSpent: 800,
        questionResults: [],
        difficulty: 4
      });

      const stats = await progressRepository.getProgressStats();

      expect(stats.averageProgress).toBeGreaterThan(0);
      expect(stats.completedTopics).toBe(2);
      expect(stats.totalTimeSpent).toBe(0); // No time added to totalTimeSpent
      expect(stats.averageAssessmentScore).toBeGreaterThan(0);
    });

    it('should return stats for specific user', async () => {
      await progressRepository.createProgress({ userId: 'user1' });
      await progressRepository.createProgress({ userId: 'user2' });

      await progressRepository.updateTopicProgress('user1', {
        topicId: 'topic1',
        topicName: 'Topic 1',
        completionPercentage: 100
      });

      const stats = await progressRepository.getProgressStats('user1');

      expect(stats.completedTopics).toBe(1);
    });

    it('should return zero stats when no progress exists', async () => {
      const stats = await progressRepository.getProgressStats();

      expect(stats.averageProgress).toBe(0);
      expect(stats.completedTopics).toBe(0);
      expect(stats.totalTimeSpent).toBe(0);
      expect(stats.averageAssessmentScore).toBe(0);
    });
  });
});