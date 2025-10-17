import { Schema, model, Document } from 'mongoose';
import { 
  StudentProgress, 
  TopicProgress, 
  AssessmentResult, 
  QuestionResult 
} from '../../types/index.js';

export interface ProgressDocument extends Omit<StudentProgress, 'userId'>, Document {
  _id: string;
  userId: string;
}

const questionResultSchema = new Schema<QuestionResult>({
  questionId: {
    type: String,
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 2000
  },
  studentAnswer: {
    type: String,
    required: true,
    maxlength: 2000
  },
  correctAnswer: {
    type: String,
    required: true,
    maxlength: 2000
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  timeSpent: {
    type: Number,
    min: 0,
    default: 0
  },
  hints: [{
    type: String,
    maxlength: 500
  }]
}, { _id: false });

const assessmentResultSchema = new Schema<AssessmentResult>({
  id: {
    type: String,
    required: true
  },
  topicId: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 0
  },
  maxScore: {
    type: Number,
    required: true,
    min: 1
  },
  completedAt: {
    type: Date,
    default: Date.now
  },
  timeSpent: {
    type: Number,
    min: 0,
    default: 0
  },
  questionResults: [questionResultSchema],
  difficulty: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  }
}, { _id: false });

const topicProgressSchema = new Schema<TopicProgress>({
  topicId: {
    type: String,
    required: true
  },
  topicName: {
    type: String,
    required: true
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  masteryLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  timeSpent: {
    type: Number,
    min: 0,
    default: 0
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  conceptsLearned: [{
    type: String
  }],
  strugglingConcepts: [{
    type: String
  }]
}, { _id: false });

const progressSchema = new Schema<ProgressDocument>({
  userId: {
    type: String,
    required: true,
    unique: true,
    ref: 'User'
  },
  topicsCompleted: [topicProgressSchema],
  currentLevel: {
    type: Number,
    min: 1,
    max: 10,
    default: 1
  },
  totalTimeSpent: {
    type: Number,
    min: 0,
    default: 0
  },
  assessmentScores: [assessmentResultSchema],
  learningPath: [{
    type: String
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete (ret as any)._id;
      delete (ret as any).__v;
      return ret;
    }
  }
});

// Indexes for performance
progressSchema.index({ userId: 1 });
progressSchema.index({ 'topicsCompleted.topicId': 1 });
progressSchema.index({ 'topicsCompleted.lastAccessed': -1 });
progressSchema.index({ 'assessmentScores.completedAt': -1 });
progressSchema.index({ lastUpdated: -1 });

// Update lastUpdated on save
progressSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

export const ProgressModel = model<ProgressDocument>('Progress', progressSchema);