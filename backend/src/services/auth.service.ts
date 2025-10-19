import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { UserModel, UserDocument } from '../database/schemas/user.schema.js';
import { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse, 
  JWTPayload, 
  RefreshTokenPayload 
} from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly JWT_EXPIRES_IN: string | number;
  private readonly JWT_REFRESH_EXPIRES_IN: string | number;
  private readonly SALT_ROUNDS: number;

  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'ml-e-super-secret-jwt-key-for-development-only-change-in-production-2024';
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'ml-e-super-secret-refresh-key-for-development-only-change-in-production-2024';
    // Parse expiration times - if it's a number string, convert to number, otherwise keep as string
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
    const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    
    this.JWT_EXPIRES_IN = /^\d+$/.test(jwtExpiresIn) ? parseInt(jwtExpiresIn) : jwtExpiresIn;
    this.JWT_REFRESH_EXPIRES_IN = /^\d+$/.test(jwtRefreshExpiresIn) ? parseInt(jwtRefreshExpiresIn) : jwtRefreshExpiresIn;
    this.SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');

    if (process.env.NODE_ENV === 'production' && 
        (this.JWT_SECRET === 'ml-e-super-secret-jwt-key-for-development-only-change-in-production-2024' || this.JWT_REFRESH_SECRET === 'ml-e-super-secret-refresh-key-for-development-only-change-in-production-2024')) {
      throw new Error('JWT secrets must be set in production environment');
    }
  }

  /**
   * Register a new user
   */
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await UserModel.findOne({
        $or: [
          { email: userData.email.toLowerCase() },
          { username: userData.username }
        ]
      });

      if (existingUser) {
        if (existingUser.email === userData.email.toLowerCase()) {
          throw new Error('Email already registered');
        }
        if (existingUser.username === userData.username) {
          throw new Error('Username already taken');
        }
      }

      // Hash password
      const passwordHash = await this.hashPassword(userData.password);

      // Create user
      const user = new UserModel({
        username: userData.username,
        email: userData.email.toLowerCase(),
        passwordHash,
        grade: userData.grade,
        preferences: {
          learningPace: 'medium',
          preferredExamples: [],
          difficultyLevel: 5
        }
      });

      await user.save();

      // Generate tokens
      const { token, refreshToken } = this.generateTokens(user);

      logger.info(`User registered successfully: ${user.email}`);

      return {
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          grade: user.grade
        },
        token,
        refreshToken
      };
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      // Find user by email or username
      const query = credentials.email 
        ? { email: credentials.email.toLowerCase() }
        : { username: credentials.username };
      
      const user = await UserModel.findOne(query);

      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(
        credentials.password, 
        user.passwordHash
      );

      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Update last active
      user.lastActive = new Date();
      await user.save();

      // Generate tokens
      const { token, refreshToken } = this.generateTokens(user);

      logger.info(`User logged in successfully: ${user.email}`);

      return {
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          grade: user.grade
        },
        token,
        refreshToken
      };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      const payload = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as RefreshTokenPayload;
      
      const user = await UserModel.findById(payload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokens = this.generateTokens(user);
      
      logger.info(`Token refreshed for user: ${user.email}`);
      
      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET) as JWTPayload;
    } catch (error) {
      logger.error('Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserDocument | null> {
    try {
      return await UserModel.findById(userId);
    } catch (error) {
      logger.error('Get user by ID failed:', error);
      return null;
    }
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT and refresh tokens
   */
  private generateTokens(user: UserDocument): { token: string; refreshToken: string } {
    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      grade: user.grade
    };

    const refreshPayload: RefreshTokenPayload = {
      userId: user._id.toString(),
      tokenVersion: 1 // Can be used for token invalidation
    };

    const token = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN
    } as SignOptions);

    const refreshToken = jwt.sign(refreshPayload, this.JWT_REFRESH_SECRET, {
      expiresIn: this.JWT_REFRESH_EXPIRES_IN
    } as SignOptions);

    return { token, refreshToken };
  }

  /**
   * Validate password strength
   */
  validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const authService = new AuthService();