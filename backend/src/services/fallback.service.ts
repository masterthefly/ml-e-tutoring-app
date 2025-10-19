import { EventEmitter } from 'events';
import { Message, MessageMetadata, AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface FallbackConfig {
  enableSimplifiedResponses: boolean;
  enableCachedResponses: boolean;
  enableStaticFallbacks: boolean;
  maxCacheAge: number;
  fallbackResponseTimeout: number;
}

export interface FallbackResponse {
  content: string;
  metadata: MessageMetadata;
  source: 'cache' | 'static' | 'simplified';
  confidence: number;
}

export interface CachedResponse {
  query: string;
  response: FallbackResponse;
  timestamp: Date;
  agentType: AgentType;
  useCount: number;
}

export class FallbackService extends EventEmitter {
  private config: FallbackConfig;
  private responseCache: Map<string, CachedResponse> = new Map();
  private staticFallbacks: Map<AgentType, Map<string, FallbackResponse>> = new Map();

  constructor(config: FallbackConfig) {
    super();
    this.config = config;
    this.initializeStaticFallbacks();
  }

  /**
   * Get fallback response when agent is unavailable
   */
  public async getFallbackResponse(
    originalMessage: Message,
    agentType: AgentType,
    context?: Record<string, any>
  ): Promise<FallbackResponse | null> {
    logger.info(`Generating fallback response for ${agentType} agent`);

    try {
      // Try cached response first
      if (this.config.enableCachedResponses) {
        const cachedResponse = this.getCachedResponse(originalMessage.content, agentType);
        if (cachedResponse) {
          logger.debug(`Using cached fallback response for ${agentType}`);
          return cachedResponse;
        }
      }

      // Try simplified response
      if (this.config.enableSimplifiedResponses) {
        const simplifiedResponse = await this.generateSimplifiedResponse(originalMessage, agentType, context);
        if (simplifiedResponse) {
          logger.debug(`Generated simplified fallback response for ${agentType}`);
          this.cacheResponse(originalMessage.content, agentType, simplifiedResponse);
          return simplifiedResponse;
        }
      }

      // Try static fallback
      if (this.config.enableStaticFallbacks) {
        const staticResponse = this.getStaticFallback(originalMessage.content, agentType);
        if (staticResponse) {
          logger.debug(`Using static fallback response for ${agentType}`);
          return staticResponse;
        }
      }

      // Last resort - generic error message
      return this.getGenericFallback(agentType);
    } catch (error) {
      logger.error(`Error generating fallback response for ${agentType}:`, error);
      return this.getGenericFallback(agentType);
    }
  }

  /**
   * Cache a successful response for future fallback use
   */
  public cacheSuccessfulResponse(
    query: string,
    response: Message,
    agentType: AgentType
  ): void {
    if (!this.config.enableCachedResponses) {
      return;
    }

    const cacheKey = this.generateCacheKey(query, agentType);
    const fallbackResponse: FallbackResponse = {
      content: response.content,
      metadata: response.metadata,
      source: 'cache',
      confidence: 0.8
    };

    const cachedResponse: CachedResponse = {
      query,
      response: fallbackResponse,
      timestamp: new Date(),
      agentType,
      useCount: 0
    };

    this.responseCache.set(cacheKey, cachedResponse);
    
    // Clean up old cache entries
    this.cleanupCache();
  }

  /**
   * Get system degradation status
   */
  public getDegradationStatus(): {
    isInDegradedMode: boolean;
    availableFeatures: string[];
    unavailableFeatures: string[];
    fallbacksActive: number;
    cacheHitRate: number;
  } {
    const totalCached = Array.from(this.responseCache.values());
    const totalUseCount = totalCached.reduce((sum, cached) => sum + cached.useCount, 0);
    const cacheHitRate = totalCached.length > 0 ? totalUseCount / totalCached.length : 0;

    return {
      isInDegradedMode: totalUseCount > 0,
      availableFeatures: this.getAvailableFeatures(),
      unavailableFeatures: this.getUnavailableFeatures(),
      fallbacksActive: totalUseCount,
      cacheHitRate
    };
  }

  /**
   * Clear all cached responses
   */
  public clearCache(): void {
    this.responseCache.clear();
    logger.info('Fallback response cache cleared');
  }

  /**
   * Get cached response if available and not expired
   */
  private getCachedResponse(query: string, agentType: AgentType): FallbackResponse | null {
    const cacheKey = this.generateCacheKey(query, agentType);
    const cached = this.responseCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache entry is expired
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.config.maxCacheAge) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    // Increment use count
    cached.useCount++;
    
    return cached.response;
  }

  /**
   * Generate simplified response based on agent type and message
   */
  private async generateSimplifiedResponse(
    originalMessage: Message,
    agentType: AgentType,
    context?: Record<string, any>
  ): Promise<FallbackResponse | null> {
    const messageContent = originalMessage.content.toLowerCase();

    switch (agentType) {
      case 'tutor':
        return this.generateSimplifiedTutorResponse(messageContent, context);
      
      case 'assessment':
        return this.generateSimplifiedAssessmentResponse(messageContent, context);
      
      case 'content':
        return this.generateSimplifiedContentResponse(messageContent, context);
      
      case 'coordinator':
        return this.generateSimplifiedCoordinatorResponse(messageContent, context);
      
      default:
        return null;
    }
  }

  /**
   * Generate simplified tutor response
   */
  private generateSimplifiedTutorResponse(
    messageContent: string,
    context?: Record<string, any>
  ): FallbackResponse {
    let response = "I'm currently operating in simplified mode. ";

    // Basic keyword matching for common ML topics
    if (messageContent.includes('machine learning') || messageContent.includes('ml')) {
      response += "Machine Learning is a field of artificial intelligence that uses algorithms to learn patterns from data. ";
    } else if (messageContent.includes('supervised learning')) {
      response += "Supervised learning uses labeled data to train algorithms to make predictions. ";
    } else if (messageContent.includes('unsupervised learning')) {
      response += "Unsupervised learning finds patterns in data without labeled examples. ";
    } else if (messageContent.includes('algorithm')) {
      response += "An algorithm is a set of rules or instructions for solving a problem. ";
    } else {
      response += "I'd be happy to help you learn about machine learning concepts. ";
    }

    response += "Please try your question again in a moment when I'm fully operational.";

    return {
      content: response,
      metadata: {
        messageType: 'explanation',
        agentId: 'fallback-tutor',
        hasCode: false,
        hasMath: false
      },
      source: 'simplified',
      confidence: 0.6
    };
  }

  /**
   * Generate simplified assessment response
   */
  private generateSimplifiedAssessmentResponse(
    messageContent: string,
    context?: Record<string, any>
  ): FallbackResponse {
    let response = "I'm currently in simplified assessment mode. ";

    if (messageContent.includes('quiz') || messageContent.includes('test')) {
      response += "I can provide a basic question: What is the main goal of machine learning? ";
      response += "(A) To replace humans (B) To learn patterns from data (C) To store data (D) To create websites";
    } else {
      response += "I can help assess your understanding with basic questions when I'm fully operational.";
    }

    return {
      content: response,
      metadata: {
        messageType: 'assessment',
        agentId: 'fallback-assessment',
        hasCode: false,
        hasMath: false
      },
      source: 'simplified',
      confidence: 0.5
    };
  }

  /**
   * Generate simplified content response
   */
  private generateSimplifiedContentResponse(
    messageContent: string,
    context?: Record<string, any>
  ): FallbackResponse {
    let response = "I'm currently in simplified content mode. ";

    if (messageContent.includes('example') || messageContent.includes('practice')) {
      response += "Here's a basic example: A simple machine learning task is predicting house prices based on size and location. ";
    } else {
      response += "I can provide basic examples and exercises when I'm fully operational.";
    }

    return {
      content: response,
      metadata: {
        messageType: 'content',
        agentId: 'fallback-content',
        hasCode: false,
        hasMath: false
      },
      source: 'simplified',
      confidence: 0.5
    };
  }

  /**
   * Generate simplified coordinator response
   */
  private generateSimplifiedCoordinatorResponse(
    messageContent: string,
    context?: Record<string, any>
  ): FallbackResponse {
    const response = "I'm currently coordinating in simplified mode. I'll do my best to help you with basic information, " +
                    "but some advanced features may be temporarily unavailable.";

    return {
      content: response,
      metadata: {
        messageType: 'system',
        agentId: 'fallback-coordinator',
        hasCode: false,
        hasMath: false
      },
      source: 'simplified',
      confidence: 0.7
    };
  }

  /**
   * Get static fallback response
   */
  private getStaticFallback(messageContent: string, agentType: AgentType): FallbackResponse | null {
    const agentFallbacks = this.staticFallbacks.get(agentType);
    if (!agentFallbacks) {
      return null;
    }

    // Simple keyword matching
    for (const [keyword, response] of agentFallbacks) {
      if (messageContent.toLowerCase().includes(keyword.toLowerCase())) {
        return response;
      }
    }

    return null;
  }

  /**
   * Get generic fallback response
   */
  private getGenericFallback(agentType: AgentType): FallbackResponse {
    const agentNames = {
      tutor: 'tutor',
      assessment: 'assessment',
      content: 'content',
      coordinator: 'coordinator'
    };

    const response = `I apologize, but the ${agentNames[agentType]} service is temporarily unavailable. ` +
                    `Please try again in a few moments. In the meantime, you can ask basic questions ` +
                    `and I'll do my best to provide simplified responses.`;

    return {
      content: response,
      metadata: {
        messageType: 'system',
        agentId: `fallback-${agentType}`,
        hasCode: false,
        hasMath: false
      },
      source: 'static',
      confidence: 0.3
    };
  }

  /**
   * Initialize static fallback responses
   */
  private initializeStaticFallbacks(): void {
    // Tutor fallbacks
    const tutorFallbacks = new Map<string, FallbackResponse>();
    tutorFallbacks.set('hello', {
      content: "Hello! I'm here to help you learn machine learning concepts. How can I assist you today?",
      metadata: { messageType: 'greeting', agentId: 'fallback-tutor' },
      source: 'static',
      confidence: 0.8
    });
    
    tutorFallbacks.set('help', {
      content: "I can help you learn about machine learning topics like supervised learning, unsupervised learning, and algorithms. What would you like to explore?",
      metadata: { messageType: 'help', agentId: 'fallback-tutor' },
      source: 'static',
      confidence: 0.7
    });

    this.staticFallbacks.set('tutor', tutorFallbacks);

    // Assessment fallbacks
    const assessmentFallbacks = new Map<string, FallbackResponse>();
    assessmentFallbacks.set('quiz', {
      content: "I can help assess your knowledge with questions. What topic would you like to be quizzed on?",
      metadata: { messageType: 'assessment', agentId: 'fallback-assessment' },
      source: 'static',
      confidence: 0.6
    });

    this.staticFallbacks.set('assessment', assessmentFallbacks);

    // Content fallbacks
    const contentFallbacks = new Map<string, FallbackResponse>();
    contentFallbacks.set('example', {
      content: "I can provide examples of machine learning concepts. What specific topic would you like an example for?",
      metadata: { messageType: 'content', agentId: 'fallback-content' },
      source: 'static',
      confidence: 0.6
    });

    this.staticFallbacks.set('content', contentFallbacks);

    // Coordinator fallbacks
    const coordinatorFallbacks = new Map<string, FallbackResponse>();
    coordinatorFallbacks.set('status', {
      content: "The system is currently operating in degraded mode. Some features may be limited.",
      metadata: { messageType: 'system', agentId: 'fallback-coordinator' },
      source: 'static',
      confidence: 0.8
    });

    this.staticFallbacks.set('coordinator', coordinatorFallbacks);
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(query: string, agentType: AgentType): string {
    // Simple hash of query + agent type
    const combined = `${query.toLowerCase().trim()}-${agentType}`;
    return Buffer.from(combined).toString('base64').substring(0, 32);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cached] of this.responseCache) {
      const age = now - cached.timestamp.getTime();
      if (age > this.config.maxCacheAge) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.responseCache.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Get available features in current mode
   */
  private getAvailableFeatures(): string[] {
    const features = ['basic_responses'];
    
    if (this.config.enableCachedResponses) {
      features.push('cached_responses');
    }
    
    if (this.config.enableSimplifiedResponses) {
      features.push('simplified_responses');
    }
    
    if (this.config.enableStaticFallbacks) {
      features.push('static_fallbacks');
    }

    return features;
  }

  /**
   * Get unavailable features in current mode
   */
  private getUnavailableFeatures(): string[] {
    return [
      'advanced_ai_responses',
      'personalized_learning',
      'complex_assessments',
      'dynamic_content_generation'
    ];
  }
}