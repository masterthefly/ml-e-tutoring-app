import bcrypt from 'bcrypt';
import { FilterQuery } from 'mongoose';
import { AbstractRepository } from './base.repository.js';
import { UserDocument, UserModel } from '../schemas/user.schema.js';
import { User, UserPreferences } from '../../types/index.js';

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  grade: 9 | 10;
  preferences?: Partial<UserPreferences>;
}

export interface AuthenticationResult {
  user: User;
  isValid: boolean;
}

export interface UserRepository {
  // Authentication methods
  createUser(userData: CreateUserData): Promise<User>;
  authenticateUser(email: string, password: string): Promise<AuthenticationResult>;
  updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean>;
  
  // User management methods
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<User | null>;
  updateLastActive(userId: string): Promise<void>;
  
  // Analytics methods
  findActiveUsers(daysBack: number): Promise<User[]>;
  findUsersByGrade(grade: 9 | 10): Promise<User[]>;
  getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    usersByGrade: { grade9: number; grade10: number };
  }>;
}

export class UserRepositoryImpl extends AbstractRepository<UserDocument> implements UserRepository {
  private readonly saltRounds = 12;

  constructor() {
    super(UserModel);
  }

  async createUser(userData: CreateUserData): Promise<User> {
    // Check if user already exists
    const existingUser = await this.findOne({
      $or: [
        { email: userData.email },
        { username: userData.username }
      ]
    });

    if (existingUser) {
      if (existingUser.email === userData.email) {
        throw new Error('User with this email already exists');
      }
      if (existingUser.username === userData.username) {
        throw new Error('User with this username already exists');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, this.saltRounds);

    // Create user document
    const userDoc = await this.create({
      username: userData.username,
      email: userData.email,
      passwordHash,
      grade: userData.grade,
      preferences: userData.preferences || {},
      createdAt: new Date(),
      lastActive: new Date()
    } as Partial<UserDocument>);

    return this.documentToUser(userDoc);
  }

  async authenticateUser(email: string, password: string): Promise<AuthenticationResult> {
    const userDoc = await this.findOne({ email: email.toLowerCase() });
    
    if (!userDoc) {
      return { user: null as any, isValid: false };
    }

    const isValid = await bcrypt.compare(password, userDoc.passwordHash);
    
    if (isValid) {
      // Update last active timestamp
      await this.updateLastActive(userDoc._id);
    }

    return {
      user: this.documentToUser(userDoc),
      isValid
    };
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const userDoc = await this.findById(userId);
    
    if (!userDoc) {
      throw new Error('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userDoc.passwordHash);
    
    if (!isCurrentPasswordValid) {
      return false;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, this.saltRounds);
    
    // Update password
    await this.updateById(userId, { passwordHash: newPasswordHash });
    
    return true;
  }

  async findByEmail(email: string): Promise<User | null> {
    const userDoc = await this.findOne({ email: email.toLowerCase() });
    return userDoc ? this.documentToUser(userDoc) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const userDoc = await this.findOne({ username });
    return userDoc ? this.documentToUser(userDoc) : null;
  }

  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<User | null> {
    const userDoc = await this.updateById(userId, { 
      $set: { 
        'preferences.learningPace': preferences.learningPace,
        'preferences.preferredExamples': preferences.preferredExamples,
        'preferences.difficultyLevel': preferences.difficultyLevel
      }
    });
    
    return userDoc ? this.documentToUser(userDoc) : null;
  }

  async updateLastActive(userId: string): Promise<void> {
    await this.updateById(userId, { lastActive: new Date() });
  }

  async findActiveUsers(daysBack: number): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const userDocs = await this.findMany({
      lastActive: { $gte: cutoffDate }
    }, {
      sort: { lastActive: -1 }
    });
    
    return userDocs.map(doc => this.documentToUser(doc));
  }

  async findUsersByGrade(grade: 9 | 10): Promise<User[]> {
    const userDocs = await this.findMany({ grade }, {
      sort: { createdAt: -1 }
    });
    
    return userDocs.map(doc => this.documentToUser(doc));
  }

  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    usersByGrade: { grade9: number; grade10: number };
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalUsers, activeUsers, grade9Count, grade10Count] = await Promise.all([
      this.count({}),
      this.count({ lastActive: { $gte: thirtyDaysAgo } }),
      this.count({ grade: 9 }),
      this.count({ grade: 10 })
    ]);

    return {
      totalUsers,
      activeUsers,
      usersByGrade: {
        grade9: grade9Count,
        grade10: grade10Count
      }
    };
  }

  private documentToUser(doc: UserDocument): User {
    return {
      id: doc._id,
      username: doc.username,
      email: doc.email,
      grade: doc.grade,
      createdAt: doc.createdAt,
      lastActive: doc.lastActive,
      preferences: doc.preferences
    };
  }
}