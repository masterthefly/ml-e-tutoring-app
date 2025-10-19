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