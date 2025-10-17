import { BaseAgent, AgentMessage, AgentConfig } from './base.agent.js';
import { LLMService, LLMRequest, createLLMService } from '../services/llm.service.js';
import { Message, MessageMetadata, AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface TutorConfig extends AgentConfig {
  llmConfig: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  educationalSettings: {
    gradeLevel: '9-10';
    subjectArea: 'machine-learning';
    maxExplanationLength: number;
    useRealWorldExamples: boolean;
    mathNotationSupport: boolean;
  };
}

export interface TutorRequest {
  sessionId: string;
  message: Message;
  context: TutorContext;
}

export interface TutorContext {
  currentTopic?: string;
  studentLevel?: 'beginner' | 'intermediate' | 'advanced';
  learningPace?: 'slow' | 'medium' | 'fast';
  previousConcepts?: string[];
  strugglingAreas?: string[];
  preferredExamples?: string[];
  conversationHistory?: Message[];
}

export interface TutorResponse {
  message: Message;
  suggestedFollowUps?: string[];
  conceptsCovered?: string[];
  difficultyLevel?: number;
  requiresAssessment?: boolean;
}

export class TutorAgent extends BaseAgent {
  private llmService: LLMService;
  private tutorConfig: TutorConfig;
  private mlCurriculum: MLCurriculum;

  constructor(config: TutorConfig) {
    super(config);
    this.tutorConfig = config;
    this.llmService = createLLMService();
    this.mlCurriculum = new MLCurriculum();
  }

  protected async initialize(): Promise<void> {
    logger.info(`Initializing Tutor Agent ${this.config.id}`);
    
    // Test LLM service connection
    const isHealthy = await this.llmService.healthCheck();
    if (!isHealthy) {
      throw new Error('LLM service health check failed');
    }

    logger.info('Tutor Agent initialized successfully');
  }

  protected async cleanup(): Promise<void> {
    logger.info(`Cleaning up Tutor Agent ${this.config.id}`);
    // No specific cleanup needed for now
  }

  protected async handleRequest(message: AgentMessage): Promise<AgentMessage | null> {
    try {
      const request = message.payload as TutorRequest;
      const response = await this.generateTutorResponse(request);
      
      return this.createResponse(message, response);
    } catch (error) {
      logger.error(`Error in Tutor Agent request handling:`, error);
      throw error;
    }
  }

  protected async handleBroadcast(message: AgentMessage): Promise<void> {
    // Handle system-wide updates
    if (message.payload.type === 'curriculum_update') {
      logger.info('Received curriculum update');
      // Update curriculum if needed
    }
  }

  protected checkHealth(): boolean {
    // Check if tutor agent is healthy
    return this.llmService !== null && this.isRunning;
  }

  /**
   * Generate tutor response for student message
   */
  private async generateTutorResponse(request: TutorRequest): Promise<TutorResponse> {
    const { message, context } = request;
    
    // Analyze student message to understand intent and topic
    const messageAnalysis = this.analyzeStudentMessage(message.content, context);
    
    // Generate appropriate system prompt based on context
    const systemPrompt = this.createSystemPrompt(context, messageAnalysis);
    
    // Prepare conversation history for LLM
    const conversationMessages = this.prepareConversationHistory(context, message);
    
    // Generate LLM response
    const llmRequest: LLMRequest = {
      systemPrompt,
      messages: conversationMessages,
      temperature: this.tutorConfig.llmConfig.temperature,
      maxTokens: this.tutorConfig.llmConfig.maxTokens
    };

    const llmResponse = await this.llmService.generateCompletion(llmRequest);
    
    // Process and format the response
    const formattedResponse = this.formatTutorResponse(llmResponse.content, messageAnalysis);
    
    // Create response message
    const responseMessage = this.createResponseMessage(formattedResponse, messageAnalysis);
    
    // Generate follow-up suggestions
    const followUps = this.generateFollowUpSuggestions(messageAnalysis, context);
    
    return {
      message: responseMessage,
      suggestedFollowUps: followUps,
      conceptsCovered: messageAnalysis.conceptsInvolved,
      difficultyLevel: messageAnalysis.difficultyLevel,
      requiresAssessment: messageAnalysis.shouldAssess
    };
  }

  /**
   * Analyze student message to understand learning needs
   */
  private analyzeStudentMessage(content: string, context: TutorContext): MessageAnalysis {
    const lowerContent = content.toLowerCase();
    
    // Detect question types
    const isQuestion = /\?|what|how|why|when|where|explain|tell me|can you/.test(lowerContent);
    const isConfused = /confused|don't understand|unclear|lost|help/.test(lowerContent);
    const isRequest = /example|show me|demonstrate|practice/.test(lowerContent);
    
    // Detect ML concepts mentioned
    const conceptsInvolved = this.mlCurriculum.detectConcepts(content);
    
    // Determine difficulty level needed
    const difficultyLevel = this.determineDifficultyLevel(content, context, conceptsInvolved);
    
    // Determine if assessment is needed
    const shouldAssess = this.shouldTriggerAssessment(content, context);
    
    return {
      messageType: isQuestion ? 'question' : isRequest ? 'request' : 'statement',
      isConfused,
      conceptsInvolved,
      difficultyLevel,
      shouldAssess,
      needsExample: /example|show|demonstrate/.test(lowerContent),
      needsMath: conceptsInvolved.some(concept => this.mlCurriculum.requiresMath(concept))
    };
  }

  /**
   * Create system prompt for LLM based on context
   */
  private createSystemPrompt(context: TutorContext, analysis: MessageAnalysis): string {
    const basePrompt = `You are an AI tutor specializing in teaching Machine Learning concepts to high school students (grades 9-10). Your role is to:

1. Explain ML concepts in age-appropriate language suitable for 9th-10th graders
2. Use real-world examples that high school students can relate to
3. Break down complex concepts into digestible parts
4. Encourage curiosity and critical thinking
5. Adapt explanations based on student understanding level

IMPORTANT GUIDELINES:
- Keep explanations clear and concise (under ${this.tutorConfig.educationalSettings.maxExplanationLength} words)
- Use analogies and examples from everyday life (sports, social media, games, etc.)
- Avoid overly technical jargon unless necessary, and always explain technical terms
- When using mathematical concepts, explain them step-by-step
- Encourage questions and provide supportive feedback
- If a concept is too advanced, break it down or suggest prerequisites

CURRENT CONTEXT:`;

    let contextPrompt = '';
    
    if (context.currentTopic) {
      contextPrompt += `\n- Current topic: ${context.currentTopic}`;
    }
    
    if (context.studentLevel) {
      contextPrompt += `\n- Student level: ${context.studentLevel}`;
    }
    
    if (context.learningPace) {
      contextPrompt += `\n- Learning pace: ${context.learningPace}`;
    }
    
    if (context.strugglingAreas && context.strugglingAreas.length > 0) {
      contextPrompt += `\n- Student struggles with: ${context.strugglingAreas.join(', ')}`;
    }
    
    if (context.previousConcepts && context.previousConcepts.length > 0) {
      contextPrompt += `\n- Previously covered: ${context.previousConcepts.join(', ')}`;
    }

    let responseGuidance = '\n\nFOR THIS RESPONSE:';
    
    if (analysis.isConfused) {
      responseGuidance += '\n- The student seems confused, provide extra clarity and reassurance';
    }
    
    if (analysis.needsExample) {
      responseGuidance += '\n- Provide concrete, relatable examples';
    }
    
    if (analysis.needsMath) {
      responseGuidance += '\n- Include mathematical explanations but keep them accessible';
    }
    
    if (analysis.conceptsInvolved.length > 0) {
      responseGuidance += `\n- Focus on these ML concepts: ${analysis.conceptsInvolved.join(', ')}`;
    }

    return basePrompt + contextPrompt + responseGuidance;
  }

  /**
   * Prepare conversation history for LLM context
   */
  private prepareConversationHistory(context: TutorContext, currentMessage: Message) {
    const messages = [];
    
    // Include recent conversation history (last 5 messages)
    if (context.conversationHistory) {
      const recentHistory = context.conversationHistory.slice(-5);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.sender === 'student' ? 'user' as const : 'assistant' as const,
          content: msg.content
        });
      }
    }
    
    // Add current student message
    messages.push({
      role: 'user' as const,
      content: currentMessage.content
    });
    
    return messages;
  }

  /**
   * Format LLM response for educational delivery
   */
  private formatTutorResponse(content: string, analysis: MessageAnalysis): string {
    let formattedContent = content;
    
    // Add mathematical notation formatting if needed
    if (analysis.needsMath && this.tutorConfig.educationalSettings.mathNotationSupport) {
      formattedContent = this.formatMathNotation(formattedContent);
    }
    
    // Ensure appropriate length
    if (formattedContent.length > this.tutorConfig.educationalSettings.maxExplanationLength) {
      formattedContent = this.truncateResponse(formattedContent);
    }
    
    return formattedContent;
  }

  /**
   * Create response message with proper metadata
   */
  private createResponseMessage(content: string, analysis: MessageAnalysis): Message {
    const metadata: MessageMetadata = {
      agentId: this.config.id,
      messageType: 'explanation',
      difficulty: analysis.difficultyLevel,
      hasCode: /```|`/.test(content),
      hasMath: analysis.needsMath
    };

    return {
      id: `tutor-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sender: 'tutor',
      content,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Generate follow-up suggestions
   */
  private generateFollowUpSuggestions(analysis: MessageAnalysis, context: TutorContext): string[] {
    const suggestions: string[] = [];
    
    // Suggest related concepts
    for (const concept of analysis.conceptsInvolved) {
      const relatedConcepts = this.mlCurriculum.getRelatedConcepts(concept);
      if (relatedConcepts.length > 0) {
        suggestions.push(`Would you like to learn about ${relatedConcepts[0]}?`);
      }
    }
    
    // Suggest practice if understanding seems good
    if (!analysis.isConfused && analysis.conceptsInvolved.length > 0) {
      suggestions.push('Would you like to try a practice problem?');
    }
    
    // Suggest examples if concept is complex
    if (analysis.difficultyLevel > 2) {
      suggestions.push('Would you like to see another example?');
    }
    
    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Determine appropriate difficulty level
   */
  private determineDifficultyLevel(content: string, context: TutorContext, concepts: string[]): number {
    let baseLevel = 1; // Start with beginner level
    
    // Adjust based on student level
    if (context.studentLevel === 'intermediate') baseLevel = 2;
    if (context.studentLevel === 'advanced') baseLevel = 3;
    
    // Adjust based on concept complexity
    const conceptComplexity = Math.max(...concepts.map(c => this.mlCurriculum.getConceptComplexity(c)));
    
    return Math.min(Math.max(baseLevel, conceptComplexity), 5);
  }

  /**
   * Determine if assessment should be triggered
   */
  private shouldTriggerAssessment(content: string, context: TutorContext): boolean {
    const assessmentTriggers = /understand|got it|makes sense|ready|next|practice/i;
    return assessmentTriggers.test(content);
  }

  /**
   * Format mathematical notation for display
   */
  private formatMathNotation(content: string): string {
    // Simple LaTeX-style formatting for common math expressions
    return content
      .replace(/\b(\w+)\^(\w+)\b/g, '$1^{$2}') // Exponents
      .replace(/\bsqrt\(([^)]+)\)/g, '√($1)') // Square roots
      .replace(/\b(\d+)\/(\d+)\b/g, '$1/$2'); // Fractions
  }

  /**
   * Truncate response while preserving meaning
   */
  private truncateResponse(content: string): string {
    const maxLength = this.tutorConfig.educationalSettings.maxExplanationLength;
    if (content.length <= maxLength) return content;
    
    // Find the last complete sentence within the limit
    const truncated = content.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    
    if (lastSentence > maxLength * 0.7) {
      return truncated.substring(0, lastSentence + 1);
    }
    
    return truncated + '...';
  }
}

/**
 * Message analysis interface
 */
interface MessageAnalysis {
  messageType: 'question' | 'request' | 'statement';
  isConfused: boolean;
  conceptsInvolved: string[];
  difficultyLevel: number;
  shouldAssess: boolean;
  needsExample: boolean;
  needsMath: boolean;
}

/**
 * ML Curriculum helper class
 */
class MLCurriculum {
  private concepts = new Map<string, ConceptInfo>();

  constructor() {
    this.initializeCurriculum();
  }

  private initializeCurriculum(): void {
    // Core ML concepts appropriate for high school
    this.concepts.set('machine learning', {
      complexity: 1,
      requiresMath: false,
      relatedConcepts: ['artificial intelligence', 'supervised learning', 'unsupervised learning'],
      keywords: ['machine learning', 'ml', 'artificial intelligence', 'ai']
    });

    this.concepts.set('supervised learning', {
      complexity: 2,
      requiresMath: false,
      relatedConcepts: ['classification', 'regression', 'training data'],
      keywords: ['supervised', 'labeled data', 'training', 'prediction']
    });

    this.concepts.set('unsupervised learning', {
      complexity: 2,
      requiresMath: false,
      relatedConcepts: ['clustering', 'pattern recognition'],
      keywords: ['unsupervised', 'clustering', 'patterns', 'unlabeled']
    });

    this.concepts.set('classification', {
      complexity: 2,
      requiresMath: true,
      relatedConcepts: ['decision trees', 'accuracy', 'features'],
      keywords: ['classification', 'categories', 'classes', 'predict']
    });

    this.concepts.set('regression', {
      complexity: 3,
      requiresMath: true,
      relatedConcepts: ['linear regression', 'prediction', 'continuous values'],
      keywords: ['regression', 'linear', 'prediction', 'continuous']
    });

    this.concepts.set('neural networks', {
      complexity: 4,
      requiresMath: true,
      relatedConcepts: ['deep learning', 'neurons', 'layers'],
      keywords: ['neural', 'network', 'deep learning', 'neurons']
    });
  }

  detectConcepts(text: string): string[] {
    const lowerText = text.toLowerCase();
    const detectedConcepts: string[] = [];

    this.concepts.forEach((info, concept) => {
      if (info.keywords.some(keyword => lowerText.includes(keyword))) {
        detectedConcepts.push(concept);
      }
    });

    return detectedConcepts;
  }

  getConceptComplexity(concept: string): number {
    return this.concepts.get(concept)?.complexity ?? 1;
  }

  requiresMath(concept: string): boolean {
    return this.concepts.get(concept)?.requiresMath ?? false;
  }

  getRelatedConcepts(concept: string): string[] {
    return this.concepts.get(concept)?.relatedConcepts ?? [];
  }
}

interface ConceptInfo {
  complexity: number;
  requiresMath: boolean;
  relatedConcepts: string[];
  keywords: string[];
}

/**
 * Create default tutor agent configuration
 */
export function createTutorConfig(agentId: string): TutorConfig {
  return {
    id: agentId,
    type: 'tutor' as AgentType,
    capabilities: [
      {
        name: 'explain_concepts',
        description: 'Explain ML concepts in age-appropriate language',
        inputTypes: ['student_question', 'concept_request'],
        outputTypes: ['explanation', 'example']
      },
      {
        name: 'generate_examples',
        description: 'Create real-world examples for ML concepts',
        inputTypes: ['concept_name', 'difficulty_level'],
        outputTypes: ['example', 'analogy']
      },
      {
        name: 'adaptive_teaching',
        description: 'Adapt teaching style based on student needs',
        inputTypes: ['student_context', 'learning_history'],
        outputTypes: ['personalized_explanation']
      }
    ],
    maxConcurrentTasks: 5,
    healthCheckInterval: 30000,
    llmConfig: {
      model: process.env.OPENAI_MODEL || 'gpt-4',
      temperature: 0.7,
      maxTokens: 800
    },
    educationalSettings: {
      gradeLevel: '9-10',
      subjectArea: 'machine-learning',
      maxExplanationLength: 500,
      useRealWorldExamples: true,
      mathNotationSupport: true
    }
  };
}