import { Schema, model, Document } from 'mongoose';
import { AgentState, AgentType } from '../../types/index.js';

// Additional types for agent schema
export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent?: string;
  type: 'request' | 'response' | 'notification' | 'coordination';
  payload: any;
  timestamp: Date;
  sessionId: string;
}

export interface AgentResponse {
  agentId: string;
  agentType: AgentType;
  content: string;
  confidence: number;
  suggestedActions?: string[];
  metadata: {
    processingTime: number;
    tokensUsed?: number;
    difficulty?: number;
    topicsCovered?: string[];
  };
}

export interface AgentStateDocument extends Omit<AgentState, 'agentId'>, Document {
  _id: string;
}

export interface AgentMessageDocument extends Omit<AgentMessage, 'id'>, Document {
  _id: string;
}

const agentStateSchema = new Schema<AgentStateDocument>({
  agentType: {
    type: String,
    enum: ['coordinator', 'tutor', 'assessment', 'content'],
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    ref: 'Session'
  },
  context: {
    type: Schema.Types.Mixed,
    default: {}
  },
  lastAction: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'idle', 'error', 'busy'],
    default: 'idle'
  },
  capabilities: [{
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
      (ret as any).agentId = ret._id;
      delete (ret as any)._id;
      delete (ret as any).__v;
      return ret;
    }
  }
});

const agentMessageSchema = new Schema<AgentMessageDocument>({
  fromAgent: {
    type: String,
    required: true
  },
  toAgent: String, // undefined means broadcast
  type: {
    type: String,
    enum: ['request', 'response', 'notification', 'coordination'],
    required: true
  },
  payload: {
    type: Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sessionId: {
    type: String,
    required: true,
    ref: 'Session'
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
agentStateSchema.index({ sessionId: 1, agentType: 1 });
agentStateSchema.index({ status: 1 });
agentStateSchema.index({ lastUpdated: -1 });

agentMessageSchema.index({ sessionId: 1, timestamp: -1 });
agentMessageSchema.index({ fromAgent: 1, timestamp: -1 });
agentMessageSchema.index({ toAgent: 1, timestamp: -1 });
agentMessageSchema.index({ type: 1, timestamp: -1 });

// Update lastUpdated on save for agent state
agentStateSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

export const AgentStateModel = model<AgentStateDocument>('AgentState', agentStateSchema);
export const AgentMessageModel = model<AgentMessageDocument>('AgentMessage', agentMessageSchema);