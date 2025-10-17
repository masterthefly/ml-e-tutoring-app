// Authentication related types

export interface User {
  id: string;
  username: string;
  email: string;
  grade: 9 | 10;
  createdAt: string;
  lastActive: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  learningPace: 'slow' | 'medium' | 'fast';
  preferredExamples: string[];
  difficultyLevel: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface AuthError {
  message: string;
  code?: string;
}