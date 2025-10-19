import { Schema, model, Document } from 'mongoose';
import { LearningSession, Message, MessageMetadata, AgentState, ProgressData } from '../../types/index.js';

export interface SessionDocument extends Omit<LearningSession, 'id'>, Document {
  _id: string;
}

const messageMetadataSchema = new Schema<MessageMetadata>({
  agentId: String,
  topicId: String,
  messageType: {
    type: String,
    enum: ['explanation', 'question', 'assessment', 'feedback', 'system'],
    required: true
  },
  difficulty: {
    type: Number,
    min: 1,
    max: 10
  },
  hasCode: {
    type: Boolean,
    default: false
  },
  hasMath: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const messageSchema = new Schema<Message>({
  id: {
    type: String,
    required: true
  },
  sender: {
    type: String,
    enum: ['student', 'tutor', 'assessment', 'content', 'coordinator'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: messageMetadataSchema,
    required: true
  }
}, { _id: false });

const agentStateSchema = new Schema<AgentState>({
  agentId: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  context: {
    type: Schema.Types.Mixed,
    default: {}
  },
  lastAction: String,
  status: {
    type: String,
    enum: ['active', 'idle', 'error'],
    default: 'idle'
  },
  capabilities: [{
    type: String
  }]
}, { _id: false });

const progressDataSchema = new Schema<ProgressData>({
  overallProgress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  currentTopic: String,
  topicsCompleted: {
    type: Number,
    default: 0
  },
  totalTopics: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  learningVelocity: {
    type: Number,
    default: 0
  },
  recommendedNextTopics: [{
    type: String
  }]
}, { _id: false });

const sessionSchema = new Schema<SessionDocument>({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: Date,
  currentTopic: {
    type: String,
    required: true
  },
  conversationHistory: [messageSchema],
  agentStates: [agentStateSchema],
  progressSnapshot: {
    type: progressDataSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete (ret as any)._id;
      delete (ret as any).__v;
      return ret;
    }
  }
});

// Indexes for performance
sessionSchema.index({ userId: 1, startTime: -1 });
sessionSchema.index({ userId: 1, endTime: 1 });
sessionSchema.index({ currentTopic: 1 });
sessionSchema.index({ 'conversationHistory.timestamp': -1 });

// Compound index for active sessions
sessionSchema.index({ userId: 1, endTime: 1 }, { 
  partialFilterExpression: { endTime: { $exists: false } } 
});

export const SessionModel = model<SessionDocument>('Session', sessionSchema);