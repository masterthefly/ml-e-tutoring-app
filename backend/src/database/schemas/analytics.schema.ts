import { Schema, model, Document } from 'mongoose';

// Learning Session Analytics
export interface LearningSessionDocument extends Document {
  userId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in seconds
  topicsDiscussed: string[];
  messagesCount: number;
  questionsAsked: number;
  conceptsLearned: string[];
  difficultyLevel: number;
  engagementScore: number; // 0-100
  completionStatus: 'active' | 'completed' | 'abandoned';
}

// Progress Tracking
export interface ProgressTrackingDocument extends Document {
  userId: string;
  topicId: string;
  topicName: string;
  sessionId: string;
  timestamp: Date;
  action: 'started' | 'progressed' | 'completed' | 'struggled' | 'mastered';
  progressPercentage: number; // 0-100
  timeSpent: number; // in seconds
  difficultyLevel: number;
  masteryLevel: 'beginner' | 'intermediate' | 'advanced';
  metadata: {
    questionsAnswered?: number;
    correctAnswers?: number;
    hintsUsed?: number;
    conceptsUnderstood?: string[];
    strugglingConcepts?: string[];
  };
}

// Learning Velocity Analytics
export interface LearningVelocityDocument extends Document {
  userId: string;
  date: Date;
  topicsStarted: number;
  topicsCompleted: number;
  totalTimeSpent: number; // in seconds
  averageSessionDuration: number; // in seconds
  engagementScore: number; // 0-100
  learningEfficiency: number; // concepts learned per hour
  streakDays: number;
  weeklyGoalProgress: number; // 0-100
}

// User Achievement
export interface UserAchievementDocument extends Document {
  userId: string;
  achievementId: string;
  achievementName: string;
  achievementType: 'milestone' | 'streak' | 'mastery' | 'engagement' | 'speed';
  earnedAt: Date;
  description: string;
  points: number;
  metadata: {
    topicId?: string;
    streakDays?: number;
    masteryLevel?: string;
    timeRecord?: number;
  };
}

// Schemas
const learningSessionSchema = new Schema<LearningSessionDocument>({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, unique: true },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date },
  duration: { type: Number },
  topicsDiscussed: [{ type: String }],
  messagesCount: { type: Number, default: 0 },
  questionsAsked: { type: Number, default: 0 },
  conceptsLearned: [{ type: String }],
  difficultyLevel: { type: Number, min: 1, max: 10, default: 5 },
  engagementScore: { type: Number, min: 0, max: 100, default: 0 },
  completionStatus: { 
    type: String, 
    enum: ['active', 'completed', 'abandoned'], 
    default: 'active' 
  }
}, { timestamps: true });

const progressTrackingSchema = new Schema<ProgressTrackingDocument>({
  userId: { type: String, required: true, index: true },
  topicId: { type: String, required: true, index: true },
  topicName: { type: String, required: true },
  sessionId: { type: String, required: true },
  timestamp: { type: Date, required: true, index: true },
  action: { 
    type: String, 
    enum: ['started', 'progressed', 'completed', 'struggled', 'mastered'],
    required: true 
  },
  progressPercentage: { type: Number, min: 0, max: 100, required: true },
  timeSpent: { type: Number, required: true },
  difficultyLevel: { type: Number, min: 1, max: 10, required: true },
  masteryLevel: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true 
  },
  metadata: {
    questionsAnswered: { type: Number },
    correctAnswers: { type: Number },
    hintsUsed: { type: Number },
    conceptsUnderstood: [{ type: String }],
    strugglingConcepts: [{ type: String }]
  }
}, { timestamps: true });

const learningVelocitySchema = new Schema<LearningVelocityDocument>({
  userId: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  topicsStarted: { type: Number, default: 0 },
  topicsCompleted: { type: Number, default: 0 },
  totalTimeSpent: { type: Number, default: 0 },
  averageSessionDuration: { type: Number, default: 0 },
  engagementScore: { type: Number, min: 0, max: 100, default: 0 },
  learningEfficiency: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  weeklyGoalProgress: { type: Number, min: 0, max: 100, default: 0 }
}, { timestamps: true });

const userAchievementSchema = new Schema<UserAchievementDocument>({
  userId: { type: String, required: true, index: true },
  achievementId: { type: String, required: true },
  achievementName: { type: String, required: true },
  achievementType: { 
    type: String, 
    enum: ['milestone', 'streak', 'mastery', 'engagement', 'speed'],
    required: true 
  },
  earnedAt: { type: Date, required: true, index: true },
  description: { type: String, required: true },
  points: { type: Number, required: true },
  metadata: {
    topicId: { type: String },
    streakDays: { type: Number },
    masteryLevel: { type: String },
    timeRecord: { type: Number }
  }
}, { timestamps: true });

// Compound indexes for performance
learningSessionSchema.index({ userId: 1, startTime: -1 });
progressTrackingSchema.index({ userId: 1, topicId: 1, timestamp: -1 });
learningVelocitySchema.index({ userId: 1, date: -1 });
userAchievementSchema.index({ userId: 1, earnedAt: -1 });

// Models
export const LearningSessionModel = model<LearningSessionDocument>('LearningSession', learningSessionSchema);
export const ProgressTrackingModel = model<ProgressTrackingDocument>('ProgressTracking', progressTrackingSchema);
export const LearningVelocityModel = model<LearningVelocityDocument>('LearningVelocity', learningVelocitySchema);
export const UserAchievementModel = model<UserAchievementDocument>('UserAchievement', userAchievementSchema);