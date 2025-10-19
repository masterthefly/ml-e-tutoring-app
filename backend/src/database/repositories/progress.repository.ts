import { FilterQuery } from 'mongoose';
import { AbstractRepository } from './base.repository.js';
import { ProgressDocument, ProgressModel } from '../schemas/progress.schema.js';
import { 
  StudentProgress, 
  TopicProgress, 
  AssessmentResult,
  QuestionResult 
} from '../../types/index.js';

export interface CreateProgressData {
  userId: string;
  initialTopic?: string;
  initialLevel?: number;
}

export interface TopicProgressUpdate {
  topicId: string;
  topicName: string;
  completionPercentage?: number;
  masteryLevel?: 'beginner' | 'intermediate' | 'advanced';
  timeSpent?: number;
  conceptsLearned?: string[];
  strugglingConcepts?: string[];
}

export interface ProgressRepository {
  // Progress management
  createProgress(progressData: CreateProgressData): Promise<StudentProgress>;
  findByUserId(userId: string): Promise<StudentProgress | null>;
  updateTopicProgress(userId: string, topicUpdate: TopicProgressUpdate): Promise<StudentProgress | null>;
  addTimeSpent(userId: string, timeSpent: number): Promise<StudentProgress | null>;
  
  // Assessment management
  addAssessmentResult(userId: string, assessment: AssessmentResult): Promise<StudentProgress | null>;
  getAssessmentHistory(userId: string, topicId?: string): Promise<AssessmentResult[]>;
  getLatestAssessment(userId: string, topicId: string): Promise<AssessmentResult | null>;
  
  // Learning path management
  updateLearningPath(userId: string, learningPath: string[]): Promise<StudentProgress | null>;
  advanceLevel(userId: string): Promise<StudentProgress | null>;
  
  // Analytics queries
  getProgressStats(userId?: string): Promise<{
    averageProgress: number;
    completedTopics: number;
    totalTimeSpent: number;
    averageAssessmentScore: number;
  }>;
  
  getTopicAnalytics(): Promise<Array<{
    topicId: string;
    topicName: string;
    studentsEnrolled: number;
    averageCompletion: number;
    averageTimeSpent: number;
    averageMasteryLevel: number;
  }>>;
  
  getLearningVelocityAnalytics(userId: string, daysBack?: number): Promise<{
    topicsPerWeek: number;
    timePerTopic: number;
    improvementTrend: 'increasing' | 'decreasing' | 'stable';
  }>;
  
  getStruggleAnalytics(): Promise<Array<{
    concept: string;
    strugglingStudents: number;
    averageTimeToMaster: number;
  }>>;
  
  getUserRankings(topicId?: string): Promise<Array<{
    userId: string;
    rank: number;
    score: number;
    completionPercentage: number;
  }>>;
}

export class ProgressRepositoryImpl extends AbstractRepository<ProgressDocument> implements ProgressRepository {
  constructor() {
    super(ProgressModel);
  }

  async createProgress(progressData: CreateProgressData): Promise<StudentProgress> {
    // Check if progress already exists
    const existing = await this.findOne({ userId: progressData.userId });
    if (existing) {
      throw new Error('Progress already exists for this user');
    }

    const progressDoc = await this.create({
      userId: progressData.userId,
      topicsCompleted: progressData.initialTopic ? [{
        topicId: progressData.initialTopic,
        topicName: progressData.initialTopic,
        completionPercentage: 0,
        masteryLevel: 'beginner',
        timeSpent: 0,
        lastAccessed: new Date(),
        conceptsLearned: [],
        strugglingConcepts: []
      }] : [],
      currentLevel: progressData.initialLevel || 1,
      totalTimeSpent: 0,
      assessmentScores: [],
      learningPath: [],
      lastUpdated: new Date()
    } as Partial<ProgressDocument>);

    return this.documentToProgress(progressDoc);
  }

  async findByUserId(userId: string): Promise<StudentProgress | null> {
    const progressDoc = await this.findOne({ userId });
    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async updateTopicProgress(userId: string, topicUpdate: TopicProgressUpdate): Promise<StudentProgress | null> {
    // First try to update existing topic
    let progressDoc = await this.model.findOneAndUpdate(
      { 
        userId,
        'topicsCompleted.topicId': topicUpdate.topicId 
      },
      {
        $set: {
          'topicsCompleted.$.topicName': topicUpdate.topicName,
          'topicsCompleted.$.completionPercentage': topicUpdate.completionPercentage,
          'topicsCompleted.$.masteryLevel': topicUpdate.masteryLevel,
          'topicsCompleted.$.lastAccessed': new Date(),
          ...(topicUpdate.timeSpent && { 
            'topicsCompleted.$.timeSpent': topicUpdate.timeSpent 
          }),
          ...(topicUpdate.conceptsLearned && { 
            'topicsCompleted.$.conceptsLearned': topicUpdate.conceptsLearned 
          }),
          ...(topicUpdate.strugglingConcepts && { 
            'topicsCompleted.$.strugglingConcepts': topicUpdate.strugglingConcepts 
          })
        }
      },
      { new: true }
    ).exec();

    // If no existing topic found, add new one
    if (!progressDoc) {
      const newTopic: TopicProgress = {
        topicId: topicUpdate.topicId,
        topicName: topicUpdate.topicName,
        completionPercentage: topicUpdate.completionPercentage || 0,
        masteryLevel: topicUpdate.masteryLevel || 'beginner',
        timeSpent: topicUpdate.timeSpent || 0,
        lastAccessed: new Date(),
        conceptsLearned: topicUpdate.conceptsLearned || [],
        strugglingConcepts: topicUpdate.strugglingConcepts || []
      };

      progressDoc = await this.model.findOneAndUpdate(
        { userId },
        { $push: { topicsCompleted: newTopic } },
        { new: true }
      ).exec();
    }

    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async addTimeSpent(userId: string, timeSpent: number): Promise<StudentProgress | null> {
    const progressDoc = await this.updateOne(
      { userId },
      { $inc: { totalTimeSpent: timeSpent } }
    );

    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async addAssessmentResult(userId: string, assessment: AssessmentResult): Promise<StudentProgress | null> {
    const progressDoc = await this.updateOne(
      { userId },
      { $push: { assessmentScores: assessment } }
    );

    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async getAssessmentHistory(userId: string, topicId?: string): Promise<AssessmentResult[]> {
    const progressDoc = await this.findOne({ userId });
    
    if (!progressDoc) {
      return [];
    }

    let assessments = progressDoc.assessmentScores;
    
    if (topicId) {
      assessments = assessments.filter(assessment => assessment.topicId === topicId);
    }

    return assessments.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }

  async getLatestAssessment(userId: string, topicId: string): Promise<AssessmentResult | null> {
    const progressDoc = await this.findOne({ userId });
    
    if (!progressDoc) {
      return null;
    }

    const topicAssessments = progressDoc.assessmentScores
      .filter(assessment => assessment.topicId === topicId)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

    return topicAssessments.length > 0 ? topicAssessments[0] : null;
  }

  async updateLearningPath(userId: string, learningPath: string[]): Promise<StudentProgress | null> {
    const progressDoc = await this.updateOne(
      { userId },
      { learningPath }
    );

    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async advanceLevel(userId: string): Promise<StudentProgress | null> {
    const progressDoc = await this.updateOne(
      { userId },
      { $inc: { currentLevel: 1 } }
    );

    return progressDoc ? this.documentToProgress(progressDoc) : null;
  }

  async getProgressStats(userId?: string): Promise<{
    averageProgress: number;
    completedTopics: number;
    totalTimeSpent: number;
    averageAssessmentScore: number;
  }> {
    const filter: FilterQuery<ProgressDocument> = userId ? { userId } : {};

    const stats = await this.model.aggregate([
      { $match: filter },
      {
        $project: {
          completedTopicsCount: { $size: '$topicsCompleted' },
          averageTopicCompletion: { $avg: '$topicsCompleted.completionPercentage' },
          totalTimeSpent: 1,
          averageAssessmentScore: {
            $cond: {
              if: { $gt: [{ $size: '$assessmentScores' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: '$assessmentScores',
                    as: 'assessment',
                    in: { $multiply: [{ $divide: ['$$assessment.score', '$$assessment.maxScore'] }, 100] }
                  }
                }
              },
              else: 0
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          averageProgress: { $avg: '$averageTopicCompletion' },
          completedTopics: { $sum: '$completedTopicsCount' },
          totalTimeSpent: { $sum: '$totalTimeSpent' },
          averageAssessmentScore: { $avg: '$averageAssessmentScore' }
        }
      }
    ]);

    if (stats.length === 0) {
      return {
        averageProgress: 0,
        completedTopics: 0,
        totalTimeSpent: 0,
        averageAssessmentScore: 0
      };
    }

    return {
      averageProgress: Math.round(stats[0].averageProgress || 0),
      completedTopics: stats[0].completedTopics || 0,
      totalTimeSpent: stats[0].totalTimeSpent || 0,
      averageAssessmentScore: Math.round(stats[0].averageAssessmentScore || 0)
    };
  }

  async getTopicAnalytics(): Promise<Array<{
    topicId: string;
    topicName: string;
    studentsEnrolled: number;
    averageCompletion: number;
    averageTimeSpent: number;
    averageMasteryLevel: number;
  }>> {
    const analytics = await this.model.aggregate([
      { $unwind: '$topicsCompleted' },
      {
        $group: {
          _id: {
            topicId: '$topicsCompleted.topicId',
            topicName: '$topicsCompleted.topicName'
          },
          studentsEnrolled: { $sum: 1 },
          averageCompletion: { $avg: '$topicsCompleted.completionPercentage' },
          averageTimeSpent: { $avg: '$topicsCompleted.timeSpent' },
          masteryLevels: { $push: '$topicsCompleted.masteryLevel' }
        }
      },
      {
        $project: {
          topicId: '$_id.topicId',
          topicName: '$_id.topicName',
          studentsEnrolled: 1,
          averageCompletion: { $round: ['$averageCompletion', 2] },
          averageTimeSpent: { $round: [{ $divide: ['$averageTimeSpent', 60] }, 2] }, // Convert to minutes
          averageMasteryLevel: {
            $avg: {
              $map: {
                input: '$masteryLevels',
                as: 'level',
                in: {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$$level', 'beginner'] }, then: 1 },
                      { case: { $eq: ['$$level', 'intermediate'] }, then: 2 },
                      { case: { $eq: ['$$level', 'advanced'] }, then: 3 }
                    ],
                    default: 1
                  }
                }
              }
            }
          }
        }
      },
      { $sort: { studentsEnrolled: -1 } }
    ]);

    return analytics.map((item: any) => ({
      topicId: item.topicId,
      topicName: item.topicName,
      studentsEnrolled: item.studentsEnrolled,
      averageCompletion: item.averageCompletion,
      averageTimeSpent: item.averageTimeSpent,
      averageMasteryLevel: Math.round(item.averageMasteryLevel * 100) / 100
    }));
  }

  async getLearningVelocityAnalytics(userId: string, daysBack: number = 30): Promise<{
    topicsPerWeek: number;
    timePerTopic: number;
    improvementTrend: 'increasing' | 'decreasing' | 'stable';
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const progressDoc = await this.findOne({ userId });
    
    if (!progressDoc) {
      return {
        topicsPerWeek: 0,
        timePerTopic: 0,
        improvementTrend: 'stable'
      };
    }

    const recentTopics = progressDoc.topicsCompleted.filter(
      topic => topic.lastAccessed >= cutoffDate
    );

    const topicsPerWeek = (recentTopics.length / daysBack) * 7;
    const timePerTopic = recentTopics.length > 0 
      ? recentTopics.reduce((sum, topic) => sum + topic.timeSpent, 0) / recentTopics.length / 60 // Convert to minutes
      : 0;

    // Calculate improvement trend based on recent assessment scores
    const recentAssessments = progressDoc.assessmentScores
      .filter(assessment => assessment.completedAt >= cutoffDate)
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    let improvementTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (recentAssessments.length >= 3) {
      const firstHalf = recentAssessments.slice(0, Math.floor(recentAssessments.length / 2));
      const secondHalf = recentAssessments.slice(Math.floor(recentAssessments.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, a) => sum + (a.score / a.maxScore), 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, a) => sum + (a.score / a.maxScore), 0) / secondHalf.length;
      
      const difference = secondHalfAvg - firstHalfAvg;
      
      if (difference > 0.05) { // 5% improvement threshold
        improvementTrend = 'increasing';
      } else if (difference < -0.05) { // 5% decline threshold
        improvementTrend = 'decreasing';
      }
    }

    return {
      topicsPerWeek: Math.round(topicsPerWeek * 100) / 100,
      timePerTopic: Math.round(timePerTopic * 100) / 100,
      improvementTrend
    };
  }

  async getStruggleAnalytics(): Promise<Array<{
    concept: string;
    strugglingStudents: number;
    averageTimeToMaster: number;
  }>> {
    const analytics = await this.model.aggregate([
      { $unwind: '$topicsCompleted' },
      { $unwind: '$topicsCompleted.strugglingConcepts' },
      {
        $group: {
          _id: '$topicsCompleted.strugglingConcepts',
          strugglingStudents: { $sum: 1 },
          averageTimeToMaster: { $avg: '$topicsCompleted.timeSpent' }
        }
      },
      {
        $project: {
          concept: '$_id',
          strugglingStudents: 1,
          averageTimeToMaster: { $round: [{ $divide: ['$averageTimeToMaster', 60] }, 2] } // Convert to minutes
        }
      },
      { $sort: { strugglingStudents: -1 } }
    ]);

    return analytics.map((item: any) => ({
      concept: item.concept,
      strugglingStudents: item.strugglingStudents,
      averageTimeToMaster: item.averageTimeToMaster
    }));
  }

  async getUserRankings(topicId?: string): Promise<Array<{
    userId: string;
    rank: number;
    score: number;
    completionPercentage: number;
  }>> {
    const matchStage: any = {};
    
    if (topicId) {
      matchStage['topicsCompleted.topicId'] = topicId;
    }

    const rankings = await this.model.aggregate([
      { $match: matchStage },
      {
        $project: {
          userId: 1,
          averageAssessmentScore: {
            $cond: {
              if: { $gt: [{ $size: '$assessmentScores' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: topicId 
                      ? { $filter: { input: '$assessmentScores', cond: { $eq: ['$$this.topicId', topicId] } } }
                      : '$assessmentScores',
                    as: 'assessment',
                    in: { $multiply: [{ $divide: ['$$assessment.score', '$$assessment.maxScore'] }, 100] }
                  }
                }
              },
              else: 0
            }
          },
          averageCompletion: topicId 
            ? {
                $avg: {
                  $map: {
                    input: { $filter: { input: '$topicsCompleted', cond: { $eq: ['$$this.topicId', topicId] } } },
                    as: 'topic',
                    in: '$$topic.completionPercentage'
                  }
                }
              }
            : { $avg: '$topicsCompleted.completionPercentage' }
        }
      },
      {
        $addFields: {
          combinedScore: {
            $add: [
              { $multiply: ['$averageAssessmentScore', 0.7] }, // 70% weight on assessments
              { $multiply: ['$averageCompletion', 0.3] } // 30% weight on completion
            ]
          }
        }
      },
      { $sort: { combinedScore: -1 } },
      {
        $group: {
          _id: null,
          users: {
            $push: {
              userId: '$userId',
              score: '$averageAssessmentScore',
              completionPercentage: '$averageCompletion',
              combinedScore: '$combinedScore'
            }
          }
        }
      },
      {
        $unwind: { path: '$users', includeArrayIndex: 'rank' }
      },
      {
        $project: {
          userId: '$users.userId',
          rank: { $add: ['$rank', 1] },
          score: { $round: ['$users.score', 2] },
          completionPercentage: { $round: ['$users.completionPercentage', 2] }
        }
      }
    ]);

    return rankings;
  }

  private documentToProgress(doc: ProgressDocument): StudentProgress {
    return {
      userId: doc.userId,
      topicsCompleted: doc.topicsCompleted,
      currentLevel: doc.currentLevel,
      totalTimeSpent: doc.totalTimeSpent,
      assessmentScores: doc.assessmentScores,
      learningPath: doc.learningPath,
      lastUpdated: doc.lastUpdated
    };
  }
}