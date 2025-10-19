import { BaseAgent, AgentMessage, AgentConfig } from './base.agent.js';
import { LLMService, LLMRequest, createLLMService } from '../services/llm.service.js';
import { Message, MessageMetadata, AgentType, AssessmentResult, QuestionResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface AssessmentConfig extends AgentConfig {
  assessmentSettings: {
    questionTypes: QuestionType[];
    difficultyLevels: number[];
    maxQuestionsPerAssessment: number;
    passingScore: number;
    adaptiveScoring: boolean;
  };
  scoringRules: {
    correctAnswerPoints: number;
    partialCreditEnabled: boolean;
    hintPenalty: number;
    timeBonusEnabled: boolean;
  };
}

export interface AssessmentRequest {
  sessionId: string;
  studentMessage: Message;
  context: AssessmentContext;
  assessmentType: 'comprehension' | 'practice' | 'quiz' | 'adaptive';
}

export interface AssessmentContext {
  currentTopic: string;
  studentLevel: 'beginner' | 'intermediate' | 'advanced';
  recentConcepts: string[];
  previousScores: number[];
  strugglingAreas: string[];
  timeSpentOnTopic: number;
  conversationHistory?: Message[];
}

export interface AssessmentResponse {
  message: Message;
  assessment?: Assessment;
  evaluationResult?: EvaluationResult;
  difficultyAdjustment?: DifficultyAdjustment;
  nextRecommendations?: string[];
}

export interface Assessment {
  id: string;
  type: 'comprehension' | 'practice' | 'quiz' | 'adaptive';
  questions: Question[];
  timeLimit?: number;
  passingScore: number;
  topic: string;
  difficulty: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hints: string[];
  difficulty: number;
  concept: string;
  timeEstimate: number;
}

export interface EvaluationResult {
  questionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  conceptsAssessed: string[];
  timeSpent: number;
  hintsUsed: number;
}

export interface DifficultyAdjustment {
  currentDifficulty: number;
  recommendedDifficulty: number;
  reason: string;
  adjustmentType: 'increase' | 'decrease' | 'maintain';
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'explanation' | 'code_completion';

export class AssessmentAgent extends BaseAgent {
  private llmService: LLMService;
  private assessmentConfig: AssessmentConfig;
  private questionBank: QuestionBank;
  private scoringEngine: ScoringEngine;

  constructor(config: AssessmentConfig) {
    super(config);
    this.assessmentConfig = config;
    this.llmService = createLLMService();
    this.questionBank = new QuestionBank();
    this.scoringEngine = new ScoringEngine(config.scoringRules);
  }

  protected async initialize(): Promise<void> {
    logger.info(`Initializing Assessment Agent ${this.config.id}`);

    // Test LLM service connection
    const isHealthy = await this.llmService.healthCheck();
    if (!isHealthy) {
      throw new Error('LLM service health check failed');
    }

    // Initialize question bank
    await this.questionBank.initialize();

    logger.info('Assessment Agent initialized successfully');
  }

  protected async cleanup(): Promise<void> {
    logger.info(`Cleaning up Assessment Agent ${this.config.id}`);
    // No specific cleanup needed for now
  }

  protected async handleRequest(message: AgentMessage): Promise<AgentMessage | null> {
    try {
      const request = message.payload as AssessmentRequest;
      const response = await this.processAssessmentRequest(request);

      return this.createResponse(message, response);
    } catch (error) {
      logger.error(`Error in Assessment Agent request handling:`, error);
      throw error;
    }
  }

  protected async handleBroadcast(message: AgentMessage): Promise<void> {
    // Handle system-wide updates
    if (message.payload.type === 'assessment_update') {
      logger.info('Received assessment configuration update');
    }
  }

  protected checkHealth(): boolean {
    return this.llmService !== null && this.questionBank !== null && this.isRunning;
  }

  /**
   * Process assessment request based on type
   */
  private async processAssessmentRequest(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { assessmentType, context, studentMessage } = request;

    switch (assessmentType) {
      case 'comprehension':
        return await this.generateComprehensionCheck(request);

      case 'practice':
        return await this.generatePracticeQuestion(request);

      case 'quiz':
        return await this.generateQuiz(request);

      case 'adaptive':
        return await this.generateAdaptiveAssessment(request);

      default:
        // If no specific type, analyze student message to determine what's needed
        return await this.analyzeAndRespond(request);
    }
  }

  /**
   * Generate comprehension check questions
   */
  private async generateComprehensionCheck(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { context } = request;

    // Generate a quick comprehension question based on recent concepts
    const question = await this.generateContextualQuestion(
      context.currentTopic,
      context.recentConcepts,
      context.studentLevel,
      'comprehension'
    );

    const assessment: Assessment = {
      id: `comp-${Date.now()}`,
      type: 'comprehension',
      questions: [question],
      passingScore: this.assessmentConfig.assessmentSettings.passingScore,
      topic: context.currentTopic,
      difficulty: this.calculateDifficulty(context)
    };

    const responseMessage = this.createQuestionMessage(question);

    return {
      message: responseMessage,
      assessment,
      nextRecommendations: ['Continue with current topic', 'Try a practice problem', 'Ask for clarification']
    };
  }

  /**
   * Generate practice question
   */
  private async generatePracticeQuestion(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { context } = request;

    const question = await this.generateContextualQuestion(
      context.currentTopic,
      context.recentConcepts,
      context.studentLevel,
      'practice'
    );

    const responseMessage = this.createQuestionMessage(question);

    return {
      message: responseMessage,
      nextRecommendations: ['Try another practice question', 'Move to next concept', 'Review explanation']
    };
  }

  /**
   * Generate full quiz assessment
   */
  private async generateQuiz(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { context } = request;
    const maxQuestions = this.assessmentConfig.assessmentSettings.maxQuestionsPerAssessment;

    const questions: Question[] = [];
    for (let i = 0; i < Math.min(maxQuestions, 5); i++) {
      const question = await this.generateContextualQuestion(
        context.currentTopic,
        context.recentConcepts,
        context.studentLevel,
        'quiz'
      );
      questions.push(question);
    }

    const assessment: Assessment = {
      id: `quiz-${Date.now()}`,
      type: 'quiz',
      questions,
      timeLimit: questions.length * 3 * 60, // 3 minutes per question
      passingScore: this.assessmentConfig.assessmentSettings.passingScore,
      topic: context.currentTopic,
      difficulty: this.calculateDifficulty(context)
    };

    const responseMessage = this.createQuizIntroMessage(assessment);

    return {
      message: responseMessage,
      assessment,
      nextRecommendations: ['Review incorrect answers', 'Move to next topic', 'Practice more']
    };
  }

  /**
   * Generate adaptive assessment that adjusts based on performance
   */
  private async generateAdaptiveAssessment(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { context } = request;

    // Start with a question at the student's current level
    const initialDifficulty = this.mapStudentLevelToDifficulty(context.studentLevel);

    const question = await this.generateContextualQuestion(
      context.currentTopic,
      context.recentConcepts,
      context.studentLevel,
      'adaptive',
      initialDifficulty
    );

    const responseMessage = this.createQuestionMessage(question);

    return {
      message: responseMessage,
      difficultyAdjustment: {
        currentDifficulty: initialDifficulty,
        recommendedDifficulty: initialDifficulty,
        reason: 'Starting at student level',
        adjustmentType: 'maintain'
      },
      nextRecommendations: ['Answer to continue adaptive assessment']
    };
  }

  /**
   * Analyze student response and provide evaluation
   */
  public async evaluateStudentResponse(
    questionId: string,
    studentAnswer: string,
    context: AssessmentContext
  ): Promise<EvaluationResult> {
    const question = await this.questionBank.getQuestion(questionId);
    if (!question) {
      throw new Error(`Question ${questionId} not found`);
    }

    // Use LLM to evaluate the response, especially for open-ended questions
    const evaluation = await this.evaluateWithLLM(question, studentAnswer);

    // Calculate score using scoring engine
    const score = this.scoringEngine.calculateScore(question, studentAnswer, evaluation);

    // Generate feedback
    const feedback = await this.generateFeedback(question, studentAnswer, evaluation);

    return {
      questionId,
      studentAnswer,
      isCorrect: evaluation.isCorrect,
      score: score.points,
      maxScore: score.maxPoints,
      feedback,
      conceptsAssessed: [question.concept],
      timeSpent: 0, // This would be tracked by the frontend
      hintsUsed: 0 // This would be tracked during the question session
    };
  }

  /**
   * Recommend difficulty adjustment based on performance
   */
  public recommendDifficultyAdjustment(
    currentDifficulty: number,
    recentScores: number[],
    context: AssessmentContext
  ): DifficultyAdjustment {
    if (recentScores.length === 0) {
      return {
        currentDifficulty,
        recommendedDifficulty: currentDifficulty,
        reason: 'No recent scores available',
        adjustmentType: 'maintain'
      };
    }

    const averageScore = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    const passingThreshold = this.assessmentConfig.assessmentSettings.passingScore;

    if (averageScore >= passingThreshold * 1.2) {
      // Student is performing well, increase difficulty
      return {
        currentDifficulty,
        recommendedDifficulty: Math.min(currentDifficulty + 1, 5),
        reason: 'Strong performance indicates readiness for increased challenge',
        adjustmentType: 'increase'
      };
    } else if (averageScore < passingThreshold * 0.8) {
      // Student is struggling, decrease difficulty
      return {
        currentDifficulty,
        recommendedDifficulty: Math.max(currentDifficulty - 1, 1),
        reason: 'Performance indicates need for additional support',
        adjustmentType: 'decrease'
      };
    } else {
      // Student is at appropriate level
      return {
        currentDifficulty,
        recommendedDifficulty: currentDifficulty,
        reason: 'Performance indicates appropriate difficulty level',
        adjustmentType: 'maintain'
      };
    }
  }

  /**
   * Analyze student message and respond appropriately
   */
  private async analyzeAndRespond(request: AssessmentRequest): Promise<AssessmentResponse> {
    const { studentMessage, context } = request;
    const content = studentMessage.content.toLowerCase();

    // Check if student is asking for assessment
    if (/quiz|test|check|assess|practice|question/.test(content)) {
      return await this.generatePracticeQuestion(request);
    }

    // Check if student seems ready for assessment
    if (/understand|got it|ready|next/.test(content)) {
      return await this.generateComprehensionCheck(request);
    }

    // Default to comprehension check
    return await this.generateComprehensionCheck(request);
  }

  /**
   * Generate contextual question using LLM
   */
  private async generateContextualQuestion(
    topic: string,
    concepts: string[],
    studentLevel: 'beginner' | 'intermediate' | 'advanced',
    questionType: 'comprehension' | 'practice' | 'quiz' | 'adaptive',
    difficulty?: number
  ): Promise<Question> {
    const systemPrompt = this.createQuestionGenerationPrompt(topic, concepts, studentLevel, questionType, difficulty);

    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate a ${questionType} question about ${topic} for a ${studentLevel} high school student.`
        }
      ],
      temperature: 0.8,
      maxTokens: 600
    };

    const response = await this.llmService.generateCompletion(llmRequest);

    // Parse the LLM response to extract question components
    return this.parseQuestionFromLLM(response.content, topic, difficulty || this.mapStudentLevelToDifficulty(studentLevel));
  }

  /**
   * Create system prompt for question generation
   */
  private createQuestionGenerationPrompt(
    topic: string,
    concepts: string[],
    studentLevel: string,
    questionType: string,
    difficulty?: number
  ): string {
    return `You are an AI assessment specialist creating ${questionType} questions for high school students (grades 9-10) learning Machine Learning.

REQUIREMENTS:
- Create questions appropriate for ${studentLevel} level students
- Focus on the topic: ${topic}
- Include these concepts: ${concepts.join(', ')}
- Question difficulty: ${difficulty || 'appropriate for level'}
- Use clear, age-appropriate language
- Provide realistic answer options for multiple choice
- Include helpful hints that guide without giving away the answer

FORMAT YOUR RESPONSE AS JSON:
{
  "question": "The main question text",
  "type": "multiple_choice|true_false|short_answer|explanation",
  "options": ["option1", "option2", "option3", "option4"] (for multiple choice only),
  "correctAnswer": "The correct answer",
  "explanation": "Why this is the correct answer",
  "hints": ["hint1", "hint2", "hint3"],
  "concept": "Primary ML concept being tested",
  "timeEstimate": 120 (seconds)
}

Make the question engaging and relatable to high school students. Use examples from social media, games, sports, or other familiar contexts when possible.`;
  }

  /**
   * Parse question from LLM response
   */
  private parseQuestionFromLLM(content: string, topic: string, difficulty: number): Question {
    try {
      // Try to parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const questionData = JSON.parse(jsonMatch[0]);

        return {
          id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: questionData.type as QuestionType,
          question: questionData.question,
          options: questionData.options,
          correctAnswer: questionData.correctAnswer,
          explanation: questionData.explanation,
          hints: questionData.hints || [],
          difficulty,
          concept: questionData.concept || topic,
          timeEstimate: questionData.timeEstimate || 120
        };
      }
    } catch (error) {
      logger.warn('Failed to parse LLM question response as JSON, using fallback');
    }

    // Fallback: create a simple question
    return this.createFallbackQuestion(topic, difficulty);
  }

  /**
   * Create fallback question when LLM parsing fails
   */
  private createFallbackQuestion(topic: string, difficulty: number): Question {
    return {
      id: `fallback-${Date.now()}`,
      type: 'multiple_choice',
      question: `What is the main goal of ${topic}?`,
      options: [
        'To make computers think like humans',
        'To analyze data and make predictions',
        'To replace human decision making',
        'To create artificial consciousness'
      ],
      correctAnswer: 'To analyze data and make predictions',
      explanation: `${topic} focuses on creating systems that can learn from data to make predictions or decisions.`,
      hints: [
        'Think about what machines learn from',
        'Consider the practical applications you see every day',
        'Focus on the data-driven aspect'
      ],
      difficulty,
      concept: topic,
      timeEstimate: 90
    };
  }

  /**
   * Evaluate student response using LLM
   */
  private async evaluateWithLLM(question: Question, studentAnswer: string): Promise<{ isCorrect: boolean; confidence: number; reasoning: string }> {
    const systemPrompt = `You are an AI assessment evaluator. Evaluate if the student's answer is correct.

Question: ${question.question}
Correct Answer: ${question.correctAnswer}
Student Answer: ${studentAnswer}

Consider:
- Exact matches and semantically equivalent answers
- Partial credit for partially correct responses
- Common misconceptions and errors

Respond with JSON:
{
  "isCorrect": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of evaluation"
}`;

    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Evaluate this answer: "${studentAnswer}"`
        }
      ],
      temperature: 0.1,
      maxTokens: 200
    };

    try {
      const response = await this.llmService.generateCompletion(llmRequest);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        return evaluation;
      }
    } catch (error) {
      logger.warn('Failed to parse LLM evaluation response');
    }

    // Fallback: simple string comparison
    const isCorrect = studentAnswer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
    return {
      isCorrect,
      confidence: isCorrect ? 1.0 : 0.0,
      reasoning: 'Simple string comparison'
    };
  }

  /**
   * Generate feedback for student response
   */
  private async generateFeedback(
    question: Question,
    studentAnswer: string,
    evaluation: { isCorrect: boolean; confidence: number; reasoning: string }
  ): Promise<string> {
    if (evaluation.isCorrect) {
      return `Correct! ${question.explanation}`;
    } else {
      return `Not quite right. ${question.explanation} Your answer "${studentAnswer}" shows you're thinking about it, but the key point is understanding how ${question.concept} works in practice.`;
    }
  }

  /**
   * Create question message
   */
  private createQuestionMessage(question: Question): Message {
    let content = question.question;

    if (question.type === 'multiple_choice' && question.options) {
      content += '\n\nOptions:';
      question.options.forEach((option, index) => {
        content += `\n${String.fromCharCode(65 + index)}. ${option}`;
      });
    }

    const metadata: MessageMetadata = {
      agentId: this.config.id,
      messageType: 'assessment',
      difficulty: question.difficulty
    };

    return {
      id: `assessment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sender: 'assessment',
      content,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Create quiz introduction message
   */
  private createQuizIntroMessage(assessment: Assessment): Message {
    const content = `Ready for a quick quiz on ${assessment.topic}? 

This quiz has ${assessment.questions.length} questions and should take about ${Math.ceil((assessment.timeLimit || 300) / 60)} minutes. You need to score ${assessment.passingScore}% or higher to pass.

Let's start with the first question:

${assessment.questions[0].question}`;

    const metadata: MessageMetadata = {
      agentId: this.config.id,
      messageType: 'assessment',
      difficulty: assessment.difficulty
    };

    return {
      id: `quiz-intro-${Date.now()}`,
      sender: 'assessment',
      content,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Calculate difficulty based on context
   */
  private calculateDifficulty(context: AssessmentContext): number {
    let difficulty = this.mapStudentLevelToDifficulty(context.studentLevel);

    // Adjust based on recent performance
    if (context.previousScores.length > 0) {
      const avgScore = context.previousScores.reduce((sum, score) => sum + score, 0) / context.previousScores.length;
      if (avgScore > 85) difficulty = Math.min(difficulty + 1, 5);
      if (avgScore < 60) difficulty = Math.max(difficulty - 1, 1);
    }

    return difficulty;
  }

  /**
   * Map student level to difficulty number
   */
  private mapStudentLevelToDifficulty(level: 'beginner' | 'intermediate' | 'advanced'): number {
    switch (level) {
      case 'beginner': return 1;
      case 'intermediate': return 3;
      case 'advanced': return 4;
      default: return 2;
    }
  }
}

/**
 * Question Bank class for managing questions
 */
class QuestionBank {
  private questions = new Map<string, Question>();

  async initialize(): Promise<void> {
    // Initialize with some basic questions
    // In a real implementation, this would load from a database
    logger.info('Question bank initialized');
  }

  async getQuestion(id: string): Promise<Question | null> {
    return this.questions.get(id) || null;
  }

  async addQuestion(question: Question): Promise<void> {
    this.questions.set(question.id, question);
  }
}

/**
 * Scoring Engine class for calculating scores
 */
class ScoringEngine {
  constructor(private rules: AssessmentConfig['scoringRules']) { }

  calculateScore(
    question: Question,
    studentAnswer: string,
    evaluation: { isCorrect: boolean; confidence: number }
  ): { points: number; maxPoints: number } {
    const maxPoints = this.rules.correctAnswerPoints;

    if (evaluation.isCorrect) {
      return { points: maxPoints, maxPoints };
    }

    // Partial credit based on confidence if enabled
    if (this.rules.partialCreditEnabled && evaluation.confidence > 0.5) {
      const partialPoints = Math.floor(maxPoints * evaluation.confidence);
      return { points: partialPoints, maxPoints };
    }

    return { points: 0, maxPoints };
  }
}

/**
 * Create default assessment agent configuration
 */
export function createAssessmentConfig(agentId: string): AssessmentConfig {
  return {
    id: agentId,
    type: 'assessment' as AgentType,
    capabilities: [
      {
        name: 'generate_questions',
        description: 'Generate assessment questions based on learning context',
        inputTypes: ['topic', 'student_level', 'concepts'],
        outputTypes: ['question', 'quiz']
      },
      {
        name: 'evaluate_responses',
        description: 'Evaluate student responses and provide feedback',
        inputTypes: ['student_answer', 'question_context'],
        outputTypes: ['evaluation', 'feedback']
      },
      {
        name: 'adaptive_difficulty',
        description: 'Adjust question difficulty based on performance',
        inputTypes: ['performance_history', 'current_level'],
        outputTypes: ['difficulty_recommendation']
      }
    ],
    maxConcurrentTasks: 3,
    healthCheckInterval: 30000,
    assessmentSettings: {
      questionTypes: ['multiple_choice', 'true_false', 'short_answer', 'explanation'],
      difficultyLevels: [1, 2, 3, 4, 5],
      maxQuestionsPerAssessment: 5,
      passingScore: 70,
      adaptiveScoring: true
    },
    scoringRules: {
      correctAnswerPoints: 10,
      partialCreditEnabled: true,
      hintPenalty: 2,
      timeBonusEnabled: false
    }
  };
}