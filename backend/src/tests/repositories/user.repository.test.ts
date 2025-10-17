import { describe, it, expect, beforeEach } from 'vitest';
import { UserRepositoryImpl, CreateUserData } from '../../database/repositories/user.repository.js';
import { UserPreferences } from '../../types/index.js';

describe('UserRepository', () => {
  let userRepository: UserRepositoryImpl;

  beforeEach(() => {
    userRepository = new UserRepositoryImpl();
  });

  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      const user = await userRepository.createUser(userData);

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.grade).toBe(9);
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.lastActive).toBeDefined();
    });

    it('should create user with preferences', async () => {
      const preferences: Partial<UserPreferences> = {
        learningPace: 'fast',
        difficultyLevel: 8,
        preferredExamples: ['sports', 'technology']
      };

      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 10,
        preferences
      };

      const user = await userRepository.createUser(userData);

      expect(user.preferences.learningPace).toBe('fast');
      expect(user.preferences.difficultyLevel).toBe(8);
      expect(user.preferences.preferredExamples).toEqual(['sports', 'technology']);
    });

    it('should throw error for duplicate email', async () => {
      const userData: CreateUserData = {
        username: 'testuser1',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const duplicateData: CreateUserData = {
        username: 'testuser2',
        email: 'test@example.com',
        password: 'password456',
        grade: 10
      };

      await expect(userRepository.createUser(duplicateData))
        .rejects.toThrow('User with this email already exists');
    });

    it('should throw error for duplicate username', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test1@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const duplicateData: CreateUserData = {
        username: 'testuser',
        email: 'test2@example.com',
        password: 'password456',
        grade: 10
      };

      await expect(userRepository.createUser(duplicateData))
        .rejects.toThrow('User with this username already exists');
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user with correct credentials', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const result = await userRepository.authenticateUser('test@example.com', 'password123');

      expect(result.isValid).toBe(true);
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
    });

    it('should reject authentication with wrong password', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const result = await userRepository.authenticateUser('test@example.com', 'wrongpassword');

      expect(result.isValid).toBe(false);
    });

    it('should reject authentication for non-existent user', async () => {
      const result = await userRepository.authenticateUser('nonexistent@example.com', 'password123');

      expect(result.isValid).toBe(false);
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const user = await userRepository.findByEmail('test@example.com');

      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
      expect(user!.username).toBe('testuser');
    });

    it('should return null for non-existent email', async () => {
      const user = await userRepository.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(userData);

      const user = await userRepository.findByUsername('testuser');

      expect(user).toBeDefined();
      expect(user!.username).toBe('testuser');
      expect(user!.email).toBe('test@example.com');
    });

    it('should return null for non-existent username', async () => {
      const user = await userRepository.findByUsername('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        grade: 9
      };

      const user = await userRepository.createUser(userData);

      const newPreferences: Partial<UserPreferences> = {
        learningPace: 'slow',
        difficultyLevel: 3,
        preferredExamples: ['music', 'art']
      };

      const updatedUser = await userRepository.updatePreferences(user.id, newPreferences);

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.preferences.learningPace).toBe('slow');
      expect(updatedUser!.preferences.difficultyLevel).toBe(3);
      expect(updatedUser!.preferences.preferredExamples).toEqual(['music', 'art']);
    });

    it('should return null for non-existent user', async () => {
      const result = await userRepository.updatePreferences('507f1f77bcf86cd799439011', {
        learningPace: 'fast'
      });

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('should update password with correct current password', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'oldpassword',
        grade: 9
      };

      const user = await userRepository.createUser(userData);

      const result = await userRepository.updatePassword(user.id, 'oldpassword', 'newpassword');

      expect(result).toBe(true);

      // Verify new password works
      const authResult = await userRepository.authenticateUser('test@example.com', 'newpassword');
      expect(authResult.isValid).toBe(true);
    });

    it('should reject password update with wrong current password', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'oldpassword',
        grade: 9
      };

      const user = await userRepository.createUser(userData);

      const result = await userRepository.updatePassword(user.id, 'wrongpassword', 'newpassword');

      expect(result).toBe(false);
    });

    it('should throw error for non-existent user', async () => {
      await expect(userRepository.updatePassword('507f1f77bcf86cd799439011', 'old', 'new'))
        .rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    it('should return correct user statistics', async () => {
      // Create users with different grades and activity
      const user1: CreateUserData = {
        username: 'user1',
        email: 'user1@example.com',
        password: 'password123',
        grade: 9
      };

      const user2: CreateUserData = {
        username: 'user2',
        email: 'user2@example.com',
        password: 'password123',
        grade: 10
      };

      const user3: CreateUserData = {
        username: 'user3',
        email: 'user3@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(user1);
      await userRepository.createUser(user2);
      await userRepository.createUser(user3);

      const stats = await userRepository.getUserStats();

      expect(stats.totalUsers).toBe(3);
      expect(stats.activeUsers).toBe(3); // All users are active (just created)
      expect(stats.usersByGrade.grade9).toBe(2);
      expect(stats.usersByGrade.grade10).toBe(1);
    });

    it('should return zero stats when no users exist', async () => {
      const stats = await userRepository.getUserStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.activeUsers).toBe(0);
      expect(stats.usersByGrade.grade9).toBe(0);
      expect(stats.usersByGrade.grade10).toBe(0);
    });
  });

  describe('findUsersByGrade', () => {
    it('should find users by grade', async () => {
      const user1: CreateUserData = {
        username: 'user1',
        email: 'user1@example.com',
        password: 'password123',
        grade: 9
      };

      const user2: CreateUserData = {
        username: 'user2',
        email: 'user2@example.com',
        password: 'password123',
        grade: 10
      };

      const user3: CreateUserData = {
        username: 'user3',
        email: 'user3@example.com',
        password: 'password123',
        grade: 9
      };

      await userRepository.createUser(user1);
      await userRepository.createUser(user2);
      await userRepository.createUser(user3);

      const grade9Users = await userRepository.findUsersByGrade(9);
      const grade10Users = await userRepository.findUsersByGrade(10);

      expect(grade9Users).toHaveLength(2);
      expect(grade10Users).toHaveLength(1);
      expect(grade9Users.map(u => u.username)).toEqual(['user3', 'user1']); // Sorted by createdAt desc
      expect(grade10Users[0].username).toBe('user2');
    });
  });
});