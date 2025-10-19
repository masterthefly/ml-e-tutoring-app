// Local type definitions to avoid cross-package import issues

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  grade: 9 | 10;
  learningInterests: string[];
  profileCompleted: boolean;
  createdAt: Date;
  lastActive: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  learningPace: 'slow' | 'medium' | 'fast';
  preferredExamples: string[];
  difficultyLevel: number;
}

export interface LearningSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  currentTopic: string;
  conversationHistory: Message[];
  agentStates: AgentState[];
  progressSnapshot: ProgressData;
}

export interface Message {
  id: string;
  sender: 'student' | 'tutor' | 'assessment' | 'content' | 'coordinator';
  content: string;
  timestamp: Date;
  metadata: MessageMetadata;
}

export interface MessageMetadata {
  agentId?: string;
  topicId?: string;
  messageType: 'explanation' | 'question' | 'assessment' | 'feedback' | 'system';
  difficulty?: number;
  hasCode?: boolean;
  hasMath?: boolean;
}

export type AgentType = 'coordinator' | 'tutor' | 'assessment' | 'content';

export interface AgentState {
  agentId: string;
  agentType: AgentType;
  sessionId: string;
  context: Record<string, any>;
  lastAction: string;
  status: 'active' | 'idle' | 'error' | 'busy';
  capabilities: string[];
  lastUpdated: Date;
}

export interface StudentProgress {
  userId: string;
  topicsCompleted: TopicProgress[];
  currentLevel: number;
  totalTimeSpent: number;
  assessmentScores: AssessmentResult[];
  learningPath: string[];
  lastUpdated: Date;
}

export interface TopicProgress {
  topicId: string;
  topicName: string;
  completionPercentage: number;
  masteryLevel: 'beginner' | 'intermediate' | 'advanced';
  timeSpent: number;
  lastAccessed: Date;
  conceptsLearned: string[];
  strugglingConcepts: string[];
}

export interface AssessmentResult {
  id: string;
  topicId: string;
  score: number;
  maxScore: number;
  completedAt: Date;
  timeSpent: number;
  questionResults: QuestionResult[];
  difficulty: number;
}

export interface QuestionResult {
  questionId: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpent: number;
  hints: string[];
}

export interface ProgressData {
  overallProgress: number;
  currentTopic: string;
  topicsCompleted: number;
  totalTopics: number;
  averageScore: number;
  learningVelocity: number;
  recommendedNextTopics: string[];
}

// Re-export auth types
export * from './auth.types.js';

// Re-export session types
export * from './session.types.js';