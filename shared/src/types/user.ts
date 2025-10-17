export interface User {
  id: string;
  username: string;
  email: string;
  grade: 9 | 10;
  createdAt: Date;
  lastActive: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  learningPace: 'slow' | 'medium' | 'fast';
  preferredExamples: string[];
  difficultyLevel: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  grade: 9 | 10;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}