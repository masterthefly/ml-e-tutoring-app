export interface MLTopic {
  id: string;
  name: string;
  description: string;
  difficulty: number;
  prerequisites: string[];
  concepts: MLConcept[];
  estimatedTimeMinutes: number;
  gradeLevel: 9 | 10 | 'both';
}

export interface MLConcept {
  id: string;
  name: string;
  description: string;
  examples: ConceptExample[];
  keyTerms: string[];
  realWorldApplications: string[];
}

export interface ConceptExample {
  id: string;
  title: string;
  description: string;
  code?: string;
  visualization?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  ageAppropriate: boolean;
}

export interface Exercise {
  id: string;
  topicId: string;
  type: 'multiple-choice' | 'short-answer' | 'coding' | 'explanation';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
  hints: string[];
  timeLimit?: number;
}

export interface Curriculum {
  id: string;
  name: string;
  description: string;
  gradeLevel: 9 | 10 | 'both';
  topics: string[]; // topic IDs in order
  totalEstimatedHours: number;
}