// Base repository exports
export type { BaseRepository } from './base.repository.js';
export { AbstractRepository } from './base.repository.js';

// User repository exports
export type { 
  UserRepository, 
  CreateUserData, 
  AuthenticationResult 
} from './user.repository.js';
export { UserRepositoryImpl } from './user.repository.js';

// Session repository exports
export type { 
  SessionRepository, 
  CreateSessionData 
} from './session.repository.js';
export { SessionRepositoryImpl } from './session.repository.js';

// Progress repository exports
export type { 
  ProgressRepository, 
  CreateProgressData, 
  TopicProgressUpdate 
} from './progress.repository.js';
export { ProgressRepositoryImpl } from './progress.repository.js';

// Repository factory for dependency injection
export class RepositoryFactory {
  private static userRepository: UserRepository;
  private static sessionRepository: SessionRepository;
  private static progressRepository: ProgressRepository;

  static getUserRepository(): UserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepositoryImpl();
    }
    return this.userRepository;
  }

  static getSessionRepository(): SessionRepository {
    if (!this.sessionRepository) {
      this.sessionRepository = new SessionRepositoryImpl();
    }
    return this.sessionRepository;
  }

  static getProgressRepository(): ProgressRepository {
    if (!this.progressRepository) {
      this.progressRepository = new ProgressRepositoryImpl();
    }
    return this.progressRepository;
  }

  // For testing - allows injection of mock repositories
  static setUserRepository(repository: UserRepository): void {
    this.userRepository = repository;
  }

  static setSessionRepository(repository: SessionRepository): void {
    this.sessionRepository = repository;
  }

  static setProgressRepository(repository: ProgressRepository): void {
    this.progressRepository = repository;
  }

  // Reset all repositories (useful for testing)
  static reset(): void {
    this.userRepository = null as any;
    this.sessionRepository = null as any;
    this.progressRepository = null as any;
  }
}