import { BaseAgent, AgentMessage, AgentConfig } from './base.agent.js';
import { LLMService, LLMRequest, createLLMService } from '../services/llm.service.js';
import { Message, MessageMetadata, AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface ContentConfig extends AgentConfig {
  contentSettings: {
    supportedFormats: ContentFormat[];
    maxContentLength: number;
    difficultyLevels: number[];
    adaptationStrategies: AdaptationStrategy[];
  };
  curriculumSettings: {
    topics: CurriculumTopic[];
    prerequisites: Map<string, string[]>;
    learningObjectives: Map<string, string[]>;
    estimatedDuration: Map<string, number>;
  };
}

export interface ContentRequest {
  sessionId: string;
  requestType: ContentRequestType;
  context: ContentContext;
  specifications?: ContentSpecifications;
}

export interface ContentContext {
  currentTopic: string;
  studentLevel: 'beginner' | 'intermediate' | 'advanced';
  learningPace: 'slow' | 'medium' | 'fast';
  completedTopics: string[];
  strugglingConcepts: string[];
  preferredExamples: string[];
  timeAvailable?: number;
  lastActivity?: Date;
}

export interface ContentSpecifications {
  format: ContentFormat;
  difficulty: number;
  length: 'short' | 'medium' | 'long';
  includeExamples: boolean;
  includeExercises: boolean;
  focusConcepts?: string[];
}

export interface ContentResponse {
  message: Message;
  content?: GeneratedContent;
  curriculumUpdate?: CurriculumUpdate;
  nextRecommendations?: ContentRecommendation[];
}

export interface GeneratedContent {
  id: string;
  type: ContentType;
  format: ContentFormat;
  title: string;
  content: string;
  difficulty: number;
  estimatedTime: number;
  concepts: string[];
  prerequisites: string[];
  exercises?: Exercise[];
  examples?: Example[];
  visualAids?: VisualAid[];
}

export interface Exercise {
  id: string;
  type: 'practice' | 'application' | 'reflection';
  description: string;
  instructions: string;
  expectedOutcome: string;
  difficulty: number;
  timeEstimate: number;
}

export interface Example {
  id: string;
  title: string;
  description: string;
  context: string;
  explanation: string;
  relatedConcepts: string[];
}

export interface VisualAid {
  id: string;
  type: 'diagram' | 'flowchart' | 'graph' | 'illustration';
  description: string;
  altText: string;
  concepts: string[];
}

export interface CurriculumUpdate {
  topicId: string;
  progressUpdate: number;
  newlyUnlocked: string[];
  recommendedNext: string[];
  adaptationReason: string;
}

export interface ContentRecommendation {
  type: 'topic' | 'exercise' | 'review' | 'assessment';
  title: string;
  description: string;
  priority: number;
  estimatedTime: number;
}

export type ContentRequestType = 'explanation' | 'example' | 'exercise' | 'curriculum_path' | 'adaptive_content';
export type ContentType = 'lesson' | 'example' | 'exercise' | 'summary' | 'reference';
export type ContentFormat = 'text' | 'interactive' | 'visual' | 'code' | 'mixed';
export type AdaptationStrategy = 'difficulty_scaling' | 'pace_adjustment' | 'style_preference' | 'remediation';

export interface CurriculumTopic {
  id: string;
  title: string;
  description: string;
  difficulty: number;
  prerequisites: string[];
  learningObjectives: string[];
  estimatedDuration: number;
  concepts: string[];
  subtopics?: string[];
}

export class ContentAgent extends BaseAgent {
  private llmService: LLMService;
  private contentConfig: ContentConfig;
  private curriculumManager: CurriculumManager;
  private contentGenerator: ContentGenerator;
  private adaptationEngine: AdaptationEngine;

  constructor(config: ContentConfig) {
    super(config);
    this.contentConfig = config;
    this.llmService = createLLMService();
    this.curriculumManager = new CurriculumManager(config.curriculumSettings);
    this.contentGenerator = new ContentGenerator(this.llmService);
    this.adaptationEngine = new AdaptationEngine();
  }

  protected async initialize(): Promise<void> {
    logger.info(`Initializing Content Agent ${this.config.id}`);
    
    // Test LLM service connection
    const isHealthy = await this.llmService.healthCheck();
    if (!isHealthy) {
      throw new Error('LLM service health check failed');
    }

    // Initialize curriculum
    await this.curriculumManager.initialize();

    logger.info('Content Agent initialized successfully');
  }

  protected async cleanup(): Promise<void> {
    logger.info(`Cleaning up Content Agent ${this.config.id}`);
    // No specific cleanup needed for now
  }

  protected async handleRequest(message: AgentMessage): Promise<AgentMessage | null> {
    try {
      const request = message.payload as ContentRequest;
      const response = await this.processContentRequest(request);
      
      return this.createResponse(message, response);
    } catch (error) {
      logger.error(`Error in Content Agent request handling:`, error);
      throw error;
    }
  }

  protected async handleBroadcast(message: AgentMessage): Promise<void> {
    // Handle system-wide updates
    if (message.payload.type === 'curriculum_update') {
      logger.info('Received curriculum update');
      await this.curriculumManager.updateCurriculum(message.payload.data);
    }
  }

  protected checkHealth(): boolean {
    return this.llmService !== null && this.curriculumManager !== null && this.isRunning;
  }

  /**
   * Process content request based on type
   */
  private async processContentRequest(request: ContentRequest): Promise<ContentResponse> {
    const { requestType, context, specifications } = request;

    switch (requestType) {
      case 'explanation':
        return await this.generateExplanation(context, specifications);
      
      case 'example':
        return await this.generateExample(context, specifications);
      
      case 'exercise':
        return await this.generateExercise(context, specifications);
      
      case 'curriculum_path':
        return await this.generateCurriculumPath(context);
      
      case 'adaptive_content':
        return await this.generateAdaptiveContent(context, specifications);
      
      default:
        throw new Error(`Unknown content request type: ${requestType}`);
    }
  }

  /**
   * Generate educational explanation
   */
  private async generateExplanation(
    context: ContentContext,
    specifications?: ContentSpecifications
  ): Promise<ContentResponse> {
    const topic = context.currentTopic;
    const difficulty = specifications?.difficulty || this.mapStudentLevelToDifficulty(context.studentLevel);
    
    // Get curriculum information for the topic
    const topicInfo = this.curriculumManager.getTopicInfo(topic);
    
    // Generate explanation content
    const content = await this.contentGenerator.generateExplanation({
      topic,
      difficulty,
      studentLevel: context.studentLevel,
      learningPace: context.learningPace,
      completedTopics: context.completedTopics,
      strugglingConcepts: context.strugglingConcepts,
      preferredExamples: context.preferredExamples,
      format: specifications?.format || 'text',
      includeExamples: specifications?.includeExamples ?? true,
      focusConcepts: specifications?.focusConcepts
    });

    const responseMessage = this.createContentMessage(content);
    
    // Generate recommendations for next steps
    const recommendations = this.generateContentRecommendations(context, content);

    return {
      message: responseMessage,
      content,
      nextRecommendations: recommendations
    };
  }

  /**
   * Generate practical example
   */
  private async generateExample(
    context: ContentContext,
    specifications?: ContentSpecifications
  ): Promise<ContentResponse> {
    const topic = context.currentTopic;
    
    const content = await this.contentGenerator.generateExample({
      topic,
      difficulty: specifications?.difficulty || this.mapStudentLevelToDifficulty(context.studentLevel),
      studentLevel: context.studentLevel,
      preferredExamples: context.preferredExamples,
      format: specifications?.format || 'text',
      focusConcepts: specifications?.focusConcepts
    });

    const responseMessage = this.createContentMessage(content);
    
    const recommendations = this.generateContentRecommendations(context, content);

    return {
      message: responseMessage,
      content,
      nextRecommendations: recommendations
    };
  }

  /**
   * Generate practice exercise
   */
  private async generateExercise(
    context: ContentContext,
    specifications?: ContentSpecifications
  ): Promise<ContentResponse> {
    const topic = context.currentTopic;
    
    const content = await this.contentGenerator.generateExercise({
      topic,
      difficulty: specifications?.difficulty || this.mapStudentLevelToDifficulty(context.studentLevel),
      studentLevel: context.studentLevel,
      completedTopics: context.completedTopics,
      timeAvailable: context.timeAvailable,
      format: specifications?.format || 'interactive',
      focusConcepts: specifications?.focusConcepts
    });

    const responseMessage = this.createContentMessage(content);
    
    const recommendations = this.generateContentRecommendations(context, content);

    return {
      message: responseMessage,
      content,
      nextRecommendations: recommendations
    };
  }

  /**
   * Generate personalized curriculum path
   */
  private async generateCurriculumPath(context: ContentContext): Promise<ContentResponse> {
    const currentProgress = this.curriculumManager.calculateProgress(context.completedTopics);
    const nextTopics = this.curriculumManager.getRecommendedTopics(
      context.completedTopics,
      context.strugglingConcepts,
      context.studentLevel
    );

    const pathContent = await this.contentGenerator.generateCurriculumPath({
      currentProgress,
      nextTopics,
      studentLevel: context.studentLevel,
      learningPace: context.learningPace,
      strugglingConcepts: context.strugglingConcepts
    });

    const responseMessage = this.createContentMessage(pathContent);
    
    const curriculumUpdate: CurriculumUpdate = {
      topicId: context.currentTopic,
      progressUpdate: currentProgress.overallProgress,
      newlyUnlocked: nextTopics.slice(0, 3),
      recommendedNext: nextTopics,
      adaptationReason: 'Progress-based curriculum adaptation'
    };

    return {
      message: responseMessage,
      content: pathContent,
      curriculumUpdate,
      nextRecommendations: nextTopics.map(topic => ({
        type: 'topic' as const,
        title: topic,
        description: this.curriculumManager.getTopicDescription(topic),
        priority: 1,
        estimatedTime: this.curriculumManager.getTopicDuration(topic)
      }))
    };
  }

  /**
   * Generate adaptive content based on performance
   */
  private async generateAdaptiveContent(
    context: ContentContext,
    specifications?: ContentSpecifications
  ): Promise<ContentResponse> {
    // Analyze student needs and adapt content accordingly
    const adaptationNeeds = this.adaptationEngine.analyzeStudentNeeds(context);
    
    // Generate content based on adaptation strategy
    const content = await this.contentGenerator.generateAdaptiveContent({
      topic: context.currentTopic,
      adaptationNeeds,
      studentLevel: context.studentLevel,
      learningPace: context.learningPace,
      strugglingConcepts: context.strugglingConcepts,
      format: specifications?.format || 'mixed'
    });

    const responseMessage = this.createContentMessage(content);
    
    const recommendations = this.generateContentRecommendations(context, content);

    return {
      message: responseMessage,
      content,
      nextRecommendations: recommendations
    };
  }

  /**
   * Create content message
   */
  private createContentMessage(content: GeneratedContent): Message {
    const metadata: MessageMetadata = {
      agentId: this.config.id,
      messageType: 'explanation',
      difficulty: content.difficulty,
      hasCode: content.format === 'code' || content.format === 'mixed',
      hasMath: content.concepts.some(concept => this.requiresMath(concept))
    };

    return {
      id: `content-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sender: 'content',
      content: content.content,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Generate content recommendations
   */
  private generateContentRecommendations(
    context: ContentContext,
    content: GeneratedContent
  ): ContentRecommendation[] {
    const recommendations: ContentRecommendation[] = [];

    // Recommend practice exercises
    if (content.type === 'lesson' || content.type === 'example') {
      recommendations.push({
        type: 'exercise',
        title: `Practice ${context.currentTopic}`,
        description: 'Try some hands-on exercises to reinforce your learning',
        priority: 1,
        estimatedTime: 10
      });
    }

    // Recommend related topics
    const relatedTopics = this.curriculumManager.getRelatedTopics(context.currentTopic);
    if (relatedTopics.length > 0) {
      recommendations.push({
        type: 'topic',
        title: `Explore ${relatedTopics[0]}`,
        description: 'This topic builds on what you just learned',
        priority: 2,
        estimatedTime: 15
      });
    }

    // Recommend review if struggling
    if (context.strugglingConcepts.includes(context.currentTopic)) {
      recommendations.push({
        type: 'review',
        title: 'Review Key Concepts',
        description: 'Let\'s review the fundamentals to strengthen your understanding',
        priority: 1,
        estimatedTime: 8
      });
    }

    return recommendations;
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

  /**
   * Check if concept requires mathematical notation
   */
  private requiresMath(concept: string): boolean {
    const mathConcepts = ['regression', 'neural networks', 'statistics', 'probability', 'optimization'];
    return mathConcepts.some(mathConcept => concept.toLowerCase().includes(mathConcept));
  }
}

/**
 * Curriculum Manager class
 */
class CurriculumManager {
  private topics = new Map<string, CurriculumTopic>();
  private prerequisites = new Map<string, string[]>();
  private learningObjectives = new Map<string, string[]>();

  constructor(private settings: ContentConfig['curriculumSettings']) {
    this.prerequisites = settings.prerequisites;
    this.learningObjectives = settings.learningObjectives;
  }

  async initialize(): Promise<void> {
    // Initialize with ML curriculum topics
    this.initializeMLCurriculum();
    logger.info('Curriculum manager initialized');
  }

  private initializeMLCurriculum(): void {
    const topics: CurriculumTopic[] = [
      {
        id: 'intro-to-ml',
        title: 'Introduction to Machine Learning',
        description: 'Basic concepts and overview of machine learning',
        difficulty: 1,
        prerequisites: [],
        learningObjectives: ['Understand what ML is', 'Identify ML applications', 'Distinguish ML from traditional programming'],
        estimatedDuration: 20,
        concepts: ['artificial intelligence', 'data', 'algorithms', 'predictions']
      },
      {
        id: 'supervised-learning',
        title: 'Supervised Learning',
        description: 'Learning with labeled data',
        difficulty: 2,
        prerequisites: ['intro-to-ml'],
        learningObjectives: ['Understand supervised learning', 'Identify classification vs regression', 'Recognize training data'],
        estimatedDuration: 25,
        concepts: ['labeled data', 'training', 'classification', 'regression']
      },
      {
        id: 'unsupervised-learning',
        title: 'Unsupervised Learning',
        description: 'Finding patterns in unlabeled data',
        difficulty: 2,
        prerequisites: ['intro-to-ml'],
        learningObjectives: ['Understand unsupervised learning', 'Learn about clustering', 'Identify pattern recognition'],
        estimatedDuration: 25,
        concepts: ['unlabeled data', 'clustering', 'patterns', 'dimensionality reduction']
      },
      {
        id: 'neural-networks',
        title: 'Neural Networks',
        description: 'Brain-inspired computing models',
        difficulty: 4,
        prerequisites: ['supervised-learning'],
        learningObjectives: ['Understand neural network basics', 'Learn about layers and neurons', 'Recognize deep learning'],
        estimatedDuration: 35,
        concepts: ['neurons', 'layers', 'weights', 'deep learning']
      }
    ];

    topics.forEach(topic => {
      this.topics.set(topic.id, topic);
    });
  }

  getTopicInfo(topicId: string): CurriculumTopic | null {
    return this.topics.get(topicId) || null;
  }

  getTopicDescription(topicId: string): string {
    return this.topics.get(topicId)?.description || 'Topic description not available';
  }

  getTopicDuration(topicId: string): number {
    return this.topics.get(topicId)?.estimatedDuration || 15;
  }

  calculateProgress(completedTopics: string[]): { overallProgress: number; topicsCompleted: number; totalTopics: number } {
    const totalTopics = this.topics.size;
    const topicsCompleted = completedTopics.length;
    const overallProgress = totalTopics > 0 ? (topicsCompleted / totalTopics) * 100 : 0;

    return { overallProgress, topicsCompleted, totalTopics };
  }

  getRecommendedTopics(
    completedTopics: string[],
    strugglingConcepts: string[],
    studentLevel: 'beginner' | 'intermediate' | 'advanced'
  ): string[] {
    const maxDifficulty = this.mapStudentLevelToMaxDifficulty(studentLevel);
    const availableTopics: string[] = [];

    this.topics.forEach((topic, topicId) => {
      // Skip if already completed
      if (completedTopics.includes(topicId)) return;
      
      // Skip if too difficult
      if (topic.difficulty > maxDifficulty) return;
      
      // Check if prerequisites are met
      const prerequisitesMet = topic.prerequisites.every(prereq => completedTopics.includes(prereq));
      if (prerequisitesMet) {
        availableTopics.push(topicId);
      }
    });

    // Sort by difficulty and priority
    return availableTopics.sort((a, b) => {
      const topicA = this.topics.get(a)!;
      const topicB = this.topics.get(b)!;
      return topicA.difficulty - topicB.difficulty;
    });
  }

  getRelatedTopics(topicId: string): string[] {
    const topic = this.topics.get(topicId);
    if (!topic) return [];

    const related: string[] = [];
    
    // Find topics that have this as a prerequisite
    this.topics.forEach((otherTopic, id) => {
      if (otherTopic.prerequisites.includes(topicId)) {
        related.push(id);
      }
    });

    return related;
  }

  async updateCurriculum(updateData: any): Promise<void> {
    // Handle curriculum updates
    logger.info('Curriculum updated with new data');
  }

  private mapStudentLevelToMaxDifficulty(level: 'beginner' | 'intermediate' | 'advanced'): number {
    switch (level) {
      case 'beginner': return 2;
      case 'intermediate': return 4;
      case 'advanced': return 5;
      default: return 3;
    }
  }
}

/**
 * Content Generator class
 */
class ContentGenerator {
  constructor(private llmService: LLMService) {}

  async generateExplanation(params: {
    topic: string;
    difficulty: number;
    studentLevel: string;
    learningPace: string;
    completedTopics: string[];
    strugglingConcepts: string[];
    preferredExamples: string[];
    format: ContentFormat;
    includeExamples: boolean;
    focusConcepts?: string[];
  }): Promise<GeneratedContent> {
    const systemPrompt = this.createExplanationPrompt(params);
    
    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create an educational explanation about ${params.topic} for a ${params.studentLevel} high school student.`
        }
      ],
      temperature: 0.7,
      maxTokens: 800
    };

    const response = await this.llmService.generateCompletion(llmRequest);
    
    return {
      id: `explanation-${Date.now()}`,
      type: 'lesson',
      format: params.format,
      title: `Understanding ${params.topic}`,
      content: response.content,
      difficulty: params.difficulty,
      estimatedTime: this.estimateReadingTime(response.content),
      concepts: params.focusConcepts || [params.topic],
      prerequisites: [],
      examples: params.includeExamples ? await this.generateExamples(params.topic, 2) : undefined
    };
  }

  async generateExample(params: {
    topic: string;
    difficulty: number;
    studentLevel: string;
    preferredExamples: string[];
    format: ContentFormat;
    focusConcepts?: string[];
  }): Promise<GeneratedContent> {
    const systemPrompt = this.createExamplePrompt(params);
    
    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a practical, relatable example of ${params.topic} for high school students.`
        }
      ],
      temperature: 0.8,
      maxTokens: 600
    };

    const response = await this.llmService.generateCompletion(llmRequest);
    
    return {
      id: `example-${Date.now()}`,
      type: 'example',
      format: params.format,
      title: `${params.topic} in Action`,
      content: response.content,
      difficulty: params.difficulty,
      estimatedTime: this.estimateReadingTime(response.content),
      concepts: params.focusConcepts || [params.topic],
      prerequisites: []
    };
  }

  async generateExercise(params: {
    topic: string;
    difficulty: number;
    studentLevel: string;
    completedTopics: string[];
    timeAvailable?: number;
    format: ContentFormat;
    focusConcepts?: string[];
  }): Promise<GeneratedContent> {
    const systemPrompt = this.createExercisePrompt(params);
    
    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a hands-on exercise about ${params.topic} that takes about ${params.timeAvailable || 10} minutes.`
        }
      ],
      temperature: 0.7,
      maxTokens: 700
    };

    const response = await this.llmService.generateCompletion(llmRequest);
    
    return {
      id: `exercise-${Date.now()}`,
      type: 'exercise',
      format: params.format,
      title: `Practice: ${params.topic}`,
      content: response.content,
      difficulty: params.difficulty,
      estimatedTime: params.timeAvailable || 10,
      concepts: params.focusConcepts || [params.topic],
      prerequisites: [],
      exercises: [{
        id: `ex-${Date.now()}`,
        type: 'practice',
        description: `Practice exercise for ${params.topic}`,
        instructions: response.content,
        expectedOutcome: `Better understanding of ${params.topic}`,
        difficulty: params.difficulty,
        timeEstimate: params.timeAvailable || 10
      }]
    };
  }

  async generateCurriculumPath(params: {
    currentProgress: { overallProgress: number; topicsCompleted: number; totalTopics: number };
    nextTopics: string[];
    studentLevel: string;
    learningPace: string;
    strugglingConcepts: string[];
  }): Promise<GeneratedContent> {
    const content = `## Your Learning Journey

You've completed ${params.currentProgress.topicsCompleted} out of ${params.currentProgress.totalTopics} topics (${Math.round(params.currentProgress.overallProgress)}% complete)!

### What's Next?

Based on your progress and ${params.learningPace} learning pace, here are your recommended next steps:

${params.nextTopics.slice(0, 3).map((topic, index) => 
  `${index + 1}. **${topic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}**`
).join('\n')}

${params.strugglingConcepts.length > 0 ? 
  `### Areas to Review\n\nYou might want to spend some extra time on:\n${params.strugglingConcepts.map(concept => `- ${concept}`).join('\n')}` : 
  '### Great Progress!\n\nYou\'re doing well across all areas. Keep up the momentum!'
}

Ready to continue your ML journey?`;

    return {
      id: `curriculum-${Date.now()}`,
      type: 'summary',
      format: 'text',
      title: 'Your Learning Path',
      content,
      difficulty: 1,
      estimatedTime: 3,
      concepts: ['curriculum', 'progress'],
      prerequisites: []
    };
  }

  async generateAdaptiveContent(params: {
    topic: string;
    adaptationNeeds: AdaptationNeeds;
    studentLevel: string;
    learningPace: string;
    strugglingConcepts: string[];
    format: ContentFormat;
  }): Promise<GeneratedContent> {
    // Generate content adapted to specific student needs
    const systemPrompt = this.createAdaptivePrompt(params);
    
    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create adaptive content for ${params.topic} addressing specific learning needs.`
        }
      ],
      temperature: 0.6,
      maxTokens: 800
    };

    const response = await this.llmService.generateCompletion(llmRequest);
    
    return {
      id: `adaptive-${Date.now()}`,
      type: 'lesson',
      format: params.format,
      title: `Personalized: ${params.topic}`,
      content: response.content,
      difficulty: params.adaptationNeeds.recommendedDifficulty,
      estimatedTime: this.estimateReadingTime(response.content),
      concepts: [params.topic],
      prerequisites: []
    };
  }

  private createExplanationPrompt(params: any): string {
    return `You are creating educational content for high school students (grades 9-10) learning Machine Learning.

TOPIC: ${params.topic}
STUDENT LEVEL: ${params.studentLevel}
LEARNING PACE: ${params.learningPace}
DIFFICULTY: ${params.difficulty}/5

REQUIREMENTS:
- Use clear, age-appropriate language
- Include real-world examples from social media, games, sports, or entertainment
- Break complex concepts into digestible parts
- Keep explanations engaging and relatable
- Use analogies that high school students understand
- Avoid overwhelming technical jargon

${params.includeExamples ? 'Include 1-2 concrete examples that illustrate the concept.' : ''}
${params.focusConcepts ? `Focus specifically on these concepts: ${params.focusConcepts.join(', ')}` : ''}

Create content that is informative yet accessible for a ${params.studentLevel} student.`;
  }

  private createExamplePrompt(params: any): string {
    return `Create a practical, relatable example of ${params.topic} for high school students.

REQUIREMENTS:
- Use contexts familiar to teenagers (social media, streaming, gaming, etc.)
- Make the example concrete and specific
- Explain how the ML concept applies in this real-world scenario
- Keep it engaging and easy to understand
- Show the practical value and relevance

PREFERRED CONTEXTS: ${params.preferredExamples.join(', ') || 'social media, entertainment, sports'}

Make this example something students can relate to and remember.`;
  }

  private createExercisePrompt(params: any): string {
    return `Create a hands-on exercise about ${params.topic} for high school students.

REQUIREMENTS:
- Make it interactive and engaging
- Provide clear step-by-step instructions
- Include expected outcomes
- Make it achievable in ${params.timeAvailable || 10} minutes
- Use familiar contexts and examples
- Include reflection questions

The exercise should help students apply what they've learned about ${params.topic} in a practical way.`;
  }

  private createAdaptivePrompt(params: any): string {
    return `Create adaptive educational content for ${params.topic} based on specific student needs.

ADAPTATION NEEDS:
- Recommended difficulty: ${params.adaptationNeeds.recommendedDifficulty}/5
- Learning style: ${params.adaptationNeeds.preferredStyle}
- Areas needing support: ${params.strugglingConcepts.join(', ')}
- Learning pace: ${params.learningPace}

REQUIREMENTS:
- Address the specific struggling concepts
- Adapt the explanation style to match learning preferences
- Provide additional scaffolding where needed
- Include remediation strategies if necessary
- Keep content encouraging and supportive

Create content that specifically addresses this student's learning needs.`;
  }

  private async generateExamples(topic: string, count: number): Promise<Example[]> {
    // Generate simple examples for the topic
    return Array.from({ length: count }, (_, i) => ({
      id: `example-${Date.now()}-${i}`,
      title: `${topic} Example ${i + 1}`,
      description: `A practical example of ${topic}`,
      context: 'Real-world application',
      explanation: `This shows how ${topic} works in practice`,
      relatedConcepts: [topic]
    }));
  }

  private estimateReadingTime(content: string): number {
    // Estimate reading time based on word count (average 200 words per minute)
    const wordCount = content.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  }
}

/**
 * Adaptation Engine class
 */
class AdaptationEngine {
  analyzeStudentNeeds(context: ContentContext): AdaptationNeeds {
    let recommendedDifficulty = this.mapStudentLevelToDifficulty(context.studentLevel);
    let preferredStyle = 'balanced';
    
    // Adjust based on struggling concepts
    if (context.strugglingConcepts.length > 2) {
      recommendedDifficulty = Math.max(1, recommendedDifficulty - 1);
      preferredStyle = 'supportive';
    }
    
    // Adjust based on learning pace
    if (context.learningPace === 'slow') {
      preferredStyle = 'detailed';
    } else if (context.learningPace === 'fast') {
      preferredStyle = 'concise';
    }

    return {
      recommendedDifficulty,
      preferredStyle,
      needsRemediation: context.strugglingConcepts.length > 0,
      adaptationStrategy: 'difficulty_scaling'
    };
  }

  private mapStudentLevelToDifficulty(level: 'beginner' | 'intermediate' | 'advanced'): number {
    switch (level) {
      case 'beginner': return 1;
      case 'intermediate': return 3;
      case 'advanced': return 4;
      default: return 2;
    }
  }
}

interface AdaptationNeeds {
  recommendedDifficulty: number;
  preferredStyle: string;
  needsRemediation: boolean;
  adaptationStrategy: AdaptationStrategy;
}

/**
 * Create default content agent configuration
 */
export function createContentConfig(agentId: string): ContentConfig {
  return {
    id: agentId,
    type: 'content' as AgentType,
    capabilities: [
      {
        name: 'generate_explanations',
        description: 'Generate educational explanations adapted to student level',
        inputTypes: ['topic', 'student_context', 'difficulty_level'],
        outputTypes: ['explanation', 'lesson_content']
      },
      {
        name: 'create_examples',
        description: 'Create relatable examples for ML concepts',
        inputTypes: ['concept', 'student_preferences'],
        outputTypes: ['example', 'demonstration']
      },
      {
        name: 'design_exercises',
        description: 'Design practice exercises and activities',
        inputTypes: ['learning_objectives', 'time_constraints'],
        outputTypes: ['exercise', 'activity']
      },
      {
        name: 'manage_curriculum',
        description: 'Manage learning paths and curriculum progression',
        inputTypes: ['student_progress', 'learning_goals'],
        outputTypes: ['curriculum_path', 'recommendations']
      }
    ],
    maxConcurrentTasks: 4,
    healthCheckInterval: 30000,
    contentSettings: {
      supportedFormats: ['text', 'interactive', 'visual', 'mixed'],
      maxContentLength: 1000,
      difficultyLevels: [1, 2, 3, 4, 5],
      adaptationStrategies: ['difficulty_scaling', 'pace_adjustment', 'style_preference', 'remediation']
    },
    curriculumSettings: {
      topics: [],
      prerequisites: new Map(),
      learningObjectives: new Map(),
      estimatedDuration: new Map()
    }
  };
}