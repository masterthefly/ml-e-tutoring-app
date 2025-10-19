import { Schema, model, Document } from 'mongoose';
import { User, UserPreferences } from '../../types/index.js';

export interface UserDocument extends Omit<User, 'id'>, Document {
  _id: string;
  passwordHash: string;
}

const userPreferencesSchema = new Schema<UserPreferences>({
  learningPace: {
    type: String,
    enum: ['slow', 'medium', 'fast'],
    default: 'medium'
  },
  preferredExamples: [{
    type: String
  }],
  difficultyLevel: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  }
}, { _id: false });

const userSchema = new Schema<UserDocument>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  grade: {
    type: Number,
    required: true,
    enum: [9, 10]
  },
  learningInterests: [{
    type: String,
    trim: true,
    maxlength: 100
  }],
  profileCompleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  preferences: {
    type: userPreferencesSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete (ret as any)._id;
      delete (ret as any).__v;
      delete (ret as any).passwordHash;
      return ret;
    }
  }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ lastActive: -1 });

// Update lastActive on save
userSchema.pre('save', function(next) {
  if (this.isModified() && !this.isModified('lastActive')) {
    this.lastActive = new Date();
  }
  next();
});

export const UserModel = model<UserDocument>('User', userSchema);