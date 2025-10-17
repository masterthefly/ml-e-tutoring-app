export interface TopicProgress {
  topicId: string;
  topicName: string;
  progress: number; // 0-100
  completedLessons: number;
  totalLessons: number;
  lastAccessed: Date;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTimeRemaining: number; // in minutes
  timeSpent?: number; // in minutes
}

export interface LearningPath {
  pathId: string;
  pathName: string;
  description: string;
  topics: TopicProgress[];
  overallProgress: number; // 0-100
  estimatedCompletionTime: number; // in hours
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
}

export interface PerformanceMetrics {
  accuracy: number; // 0-100
  averageResponseTime: number; // in seconds
  streakDays: number;
  totalTimeSpent: number; // in minutes
  conceptsMastered: number;
  totalConcepts: number;
  weakAreas: string[];
  strongAreas: string[];
}

export interface UserProgress {
  userId: string;
  overallProgress: number; // 0-100
  currentLevel: string;
  xpPoints: number;
  topics: TopicProgress[];
  learningPaths: LearningPath[];
  performance: PerformanceMetrics;
  achievements: Achievement[];
  lastActivity: Date;
  studyStreak: number;
  weeklyGoal: number; // minutes per week
  weeklyProgress: number; // minutes completed this week
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: Date;
  category: 'progress' | 'streak' | 'mastery' | 'speed' | 'consistency';
}

export interface ProgressUpdate {
  topicId: string;
  lessonId: string;
  progress: number;
  timeSpent: number;
  accuracy?: number;
  timestamp: Date;
}

export interface StudySession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  topicsStudied: string[];
  totalTimeSpent: number;
  questionsAnswered: number;
  correctAnswers: number;
  conceptsLearned: string[];
}

export interface AssessmentResult {
  assessmentId: string;
  topicId: string;
  score: number; // 0-100
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number; // in seconds
  completedAt: Date;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  conceptsAssessed: string[];
  weakConcepts: string[];
  strongConcepts: string[];
}