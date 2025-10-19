import { 
  LearningSessionModel, 
  ProgressTrackingModel, 
  LearningVelocityModel, 
  UserAchievementModel,
  LearningSessionDocument,
  ProgressTrackingDocument,
  LearningVelocityDocument
} from '../database/schemas/analytics.schema.js';
import { logger } from '../utils/logger.js';

interface SessionStartData {
  userId: string;
  sessionId: string;
  difficultyLevel?: number;
}

interface ProgressUpdateData {
  userId: string;
  sessionId: string;
  topicId: string;
  topicName: string;
  action: 'started' | 'progressed' | 'completed' | 'struggled' | 'mastered';
  progressPercentage: number;
  timeSpent: number;
  difficultyLevel: number;
  masteryLevel: 'beginner' | 'intermediate' | 'advanced';
  metadata?: {
    questionsAnswered?: number;
    correctAnswers?: number;
    hintsUsed?: number;
    conceptsUnderstood?: string[];
    strugglingConcepts?: string[];
  };
}

interface LearningAnalytics {
  overallProgress: number;
  topicsCompleted: number;
  totalTimeSpent: number;
  averageSessionDuration: number;
  learningVelocity: number;
  engagementScore: number;
  streakDays: number;
  recentTopics: string[];
  strugglingConcepts: string[];
  masteredConcepts: string[];
  achievements: any[];
  weeklyProgress: {
    date: string;
    timeSpent: number;
    topicsCompleted: number;
  }[];
}

class AnalyticsService {
  /**
   * Start a new learning session
   */
  async startSession(data: SessionStartData): Promise<void> {
    try {
      const session = new LearningSessionModel({
        userId: data.userId,
        sessionId: data.sessionId,
        startTime: new Date(),
        difficultyLevel: data.difficultyLevel || 5,
        completionStatus: 'active'
      });

      await session.save();
      logger.info(`Learning session started for user ${data.userId}`, { sessionId: data.sessionId });
    } catch (error) {
      logger.error('Error starting learning session:', error);
    }
  }

  /**
   * End a learning session
   */
  async endSession(sessionId: string, topicsDiscussed: string[] = [], conceptsLearned: string[] = []): Promise<void> {
    try {
      const session = await LearningSessionModel.findOne({ sessionId });
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return;
      }

      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
      
      // Calculate engagement score based on duration and activity
      const engagementScore = this.calculateEngagementScore(duration, topicsDiscussed.length, conceptsLearned.length);

      await LearningSessionModel.updateOne(
        { sessionId },
        {
          $set: {
            endTime,
            duration,
            topicsDiscussed,
            conceptsLearned,
            engagementScore,
            completionStatus: 'completed'
          }
        }
      );

      // Update daily learning velocity
      await this.updateLearningVelocity(session.userId, duration, topicsDiscussed.length, conceptsLearned.length);

      logger.info(`Learning session ended for user ${session.userId}`, { 
        sessionId, 
        duration, 
        engagementScore 
      });
    } catch (error) {
      logger.error('Error ending learning session:', error);
    }
  }

  /**
   * Track progress on a specific topic
   */
  async trackProgress(data: ProgressUpdateData): Promise<void> {
    try {
      const progressEntry = new ProgressTrackingModel({
        userId: data.userId,
        topicId: data.topicId,
        topicName: data.topicName,
        sessionId: data.sessionId,
        timestamp: new Date(),
        action: data.action,
        progressPercentage: data.progressPercentage,
        timeSpent: data.timeSpent,
        difficultyLevel: data.difficultyLevel,
        masteryLevel: data.masteryLevel,
        metadata: data.metadata || {}
      });

      await progressEntry.save();

      // Check for achievements
      await this.checkAchievements(data.userId, data);

      logger.info(`Progress tracked for user ${data.userId}`, { 
        topicId: data.topicId, 
        action: data.action,
        progress: data.progressPercentage 
      });
    } catch (error) {
      logger.error('Error tracking progress:', error);
    }
  }

  /**
   * Get comprehensive learning analytics for a user
   */
  async getUserAnalytics(userId: string, days: number = 30): Promise<LearningAnalytics> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get recent sessions
      const sessions = await LearningSessionModel.find({
        userId,
        startTime: { $gte: startDate }
      }).sort({ startTime: -1 });

      // Get progress data
      const progressData = await ProgressTrackingModel.find({
        userId,
        timestamp: { $gte: startDate }
      }).sort({ timestamp: -1 });

      // Get learning velocity data
      const velocityData = await LearningVelocityModel.find({
        userId,
        date: { $gte: startDate }
      }).sort({ date: -1 });

      // Get achievements
      const achievements = await UserAchievementModel.find({
        userId,
        earnedAt: { $gte: startDate }
      }).sort({ earnedAt: -1 });

      // Calculate analytics
      const analytics = this.calculateAnalytics(sessions, progressData, velocityData, achievements);

      return analytics;
    } catch (error) {
      logger.error('Error getting user analytics:', error);
      return this.getDefaultAnalytics();
    }
  }

  /**
   * Get learning progress for specific topics
   */
  async getTopicProgress(userId: string, topicIds?: string[]): Promise<any[]> {
    try {
      const query: any = { userId };
      if (topicIds && topicIds.length > 0) {
        query.topicId = { $in: topicIds };
      }

      const progressData = await ProgressTrackingModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$topicId',
            topicName: { $first: '$topicName' },
            latestProgress: { $max: '$progressPercentage' },
            totalTimeSpent: { $sum: '$timeSpent' },
            lastAccessed: { $max: '$timestamp' },
            masteryLevel: { $last: '$masteryLevel' },
            conceptsUnderstood: { $addToSet: '$metadata.conceptsUnderstood' },
            strugglingConcepts: { $addToSet: '$metadata.strugglingConcepts' }
          }
        },
        { $sort: { lastAccessed: -1 } }
      ]);

      return progressData.map(topic => ({
        topicId: topic._id,
        topicName: topic.topicName,
        completionPercentage: topic.latestProgress,
        timeSpent: topic.totalTimeSpent,
        lastAccessed: topic.lastAccessed,
        masteryLevel: topic.masteryLevel,
        conceptsLearned: topic.conceptsUnderstood.flat().filter(Boolean),
        strugglingConcepts: topic.strugglingConcepts.flat().filter(Boolean)
      }));
    } catch (error) {
      logger.error('Error getting topic progress:', error);
      return [];
    }
  }

  /**
   * Update message count for a session
   */
  async updateSessionActivity(sessionId: string, messageCount: number = 1, questionCount: number = 0): Promise<void> {
    try {
      await LearningSessionModel.updateOne(
        { sessionId },
        {
          $inc: {
            messagesCount: messageCount,
            questionsAsked: questionCount
          }
        }
      );
    } catch (error) {
      logger.error('Error updating session activity:', error);
    }
  }

  /**
   * Calculate engagement score based on session metrics
   */
  private calculateEngagementScore(duration: number, topicsCount: number, conceptsCount: number): number {
    // Base score from duration (up to 30 points for 30+ minutes)
    const durationScore = Math.min(30, duration / 60);
    
    // Topic diversity score (up to 35 points for 5+ topics)
    const topicScore = Math.min(35, topicsCount * 7);
    
    // Learning outcome score (up to 35 points for 5+ concepts)
    const conceptScore = Math.min(35, conceptsCount * 7);
    
    return Math.round(durationScore + topicScore + conceptScore);
  }

  /**
   * Update daily learning velocity metrics
   */
  private async updateLearningVelocity(userId: string, sessionDuration: number, topicsCount: number, conceptsCount: number): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const learningEfficiency = sessionDuration > 0 ? (conceptsCount / (sessionDuration / 3600)) : 0;

      await LearningVelocityModel.updateOne(
        { userId, date: today },
        {
          $inc: {
            topicsStarted: topicsCount,
            topicsCompleted: topicsCount,
            totalTimeSpent: sessionDuration
          },
          $set: {
            learningEfficiency: learningEfficiency,
            averageSessionDuration: sessionDuration
          }
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Error updating learning velocity:', error);
    }
  }

  /**
   * Check and award achievements
   */
  private async checkAchievements(userId: string, progressData: ProgressUpdateData): Promise<void> {
    try {
      // Check for topic completion achievement
      if (progressData.action === 'completed' && progressData.progressPercentage >= 100) {
        await this.awardAchievement(userId, {
          achievementId: `topic_completed_${progressData.topicId}`,
          achievementName: 'Topic Master',
          achievementType: 'milestone',
          description: `Completed ${progressData.topicName}`,
          points: 100,
          metadata: { topicId: progressData.topicId }
        });
      }

      // Check for mastery achievement
      if (progressData.action === 'mastered') {
        await this.awardAchievement(userId, {
          achievementId: `topic_mastered_${progressData.topicId}`,
          achievementName: 'Concept Master',
          achievementType: 'mastery',
          description: `Mastered ${progressData.topicName}`,
          points: 200,
          metadata: { 
            topicId: progressData.topicId,
            masteryLevel: progressData.masteryLevel 
          }
        });
      }
    } catch (error) {
      logger.error('Error checking achievements:', error);
    }
  }

  /**
   * Award an achievement to a user
   */
  private async awardAchievement(userId: string, achievement: any): Promise<void> {
    try {
      // Check if achievement already exists
      const existing = await UserAchievementModel.findOne({
        userId,
        achievementId: achievement.achievementId
      });

      if (existing) {
        return; // Achievement already awarded
      }

      const newAchievement = new UserAchievementModel({
        userId,
        ...achievement,
        earnedAt: new Date()
      });

      await newAchievement.save();
      logger.info(`Achievement awarded to user ${userId}`, { achievement: achievement.achievementName });
    } catch (error) {
      logger.error('Error awarding achievement:', error);
    }
  }

  /**
   * Calculate comprehensive analytics from raw data
   */
  private calculateAnalytics(
    sessions: LearningSessionDocument[], 
    progressData: ProgressTrackingDocument[], 
    velocityData: LearningVelocityDocument[],
    achievements: any[]
  ): LearningAnalytics {
    const totalTimeSpent = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const averageSessionDuration = sessions.length > 0 ? totalTimeSpent / sessions.length : 0;
    
    const completedTopics = progressData.filter(p => p.action === 'completed').length;
    const allTopics = [...new Set(progressData.map(p => p.topicId))];
    const overallProgress = allTopics.length > 0 ? (completedTopics / allTopics.length) * 100 : 0;

    const recentTopics = [...new Set(progressData.slice(0, 10).map(p => p.topicName))];
    
    const strugglingConcepts = progressData
      .filter(p => p.action === 'struggled')
      .flatMap(p => p.metadata?.strugglingConcepts || [])
      .slice(0, 5);

    const masteredConcepts = progressData
      .filter(p => p.action === 'mastered')
      .flatMap(p => p.metadata?.conceptsUnderstood || [])
      .slice(0, 10);

    const avgEngagement = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.engagementScore, 0) / sessions.length 
      : 0;

    const learningVelocity = velocityData.length > 0
      ? velocityData.reduce((sum, v) => sum + v.learningEfficiency, 0) / velocityData.length
      : 0;

    // Calculate streak days
    const streakDays = this.calculateStreakDays(velocityData);

    // Weekly progress data
    const weeklyProgress = velocityData.slice(0, 7).map(v => ({
      date: v.date.toISOString().split('T')[0],
      timeSpent: v.totalTimeSpent,
      topicsCompleted: v.topicsCompleted
    }));

    return {
      overallProgress: Math.round(overallProgress),
      topicsCompleted: completedTopics,
      totalTimeSpent,
      averageSessionDuration: Math.round(averageSessionDuration),
      learningVelocity: Math.round(learningVelocity * 100) / 100,
      engagementScore: Math.round(avgEngagement),
      streakDays,
      recentTopics,
      strugglingConcepts,
      masteredConcepts,
      achievements: achievements.map(a => ({
        name: a.achievementName,
        type: a.achievementType,
        description: a.description,
        points: a.points,
        earnedAt: a.earnedAt
      })),
      weeklyProgress
    };
  }

  /**
   * Calculate learning streak days
   */
  private calculateStreakDays(velocityData: LearningVelocityDocument[]): number {
    if (velocityData.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < velocityData.length; i++) {
      const dataDate = new Date(velocityData[i].date);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      if (dataDate.getTime() === expectedDate.getTime() && velocityData[i].totalTimeSpent > 0) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get default analytics when no data is available
   */
  private getDefaultAnalytics(): LearningAnalytics {
    return {
      overallProgress: 0,
      topicsCompleted: 0,
      totalTimeSpent: 0,
      averageSessionDuration: 0,
      learningVelocity: 0,
      engagementScore: 0,
      streakDays: 0,
      recentTopics: [],
      strugglingConcepts: [],
      masteredConcepts: [],
      achievements: [],
      weeklyProgress: []
    };
  }
}

export const analyticsService = new AnalyticsService();