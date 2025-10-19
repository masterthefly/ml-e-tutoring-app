import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

interface ChatResponse {
  message: string;
  confidence: number;
  agentName: string;
  metadata?: {
    model: string;
    tokens: number;
    topic?: string;
  };
}

class OpenAIService {
  private client: OpenAI | null = null;
  private isInitialized = false;
  private initializationAttempted = false;

  constructor() {
    // Don't initialize in constructor - wait for first use
  }

  private initialize(): void {
    this.initializationAttempted = true;
    
    const apiKey = process.env.OPENAI_API_KEY;
    
    logger.info('OpenAI initialization - API key check:', {
      hasApiKey: !!apiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none'
    });
    
    if (!apiKey) {
      logger.warn('OpenAI API key not found. AI responses will be disabled.');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      logger.info('OpenAI service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI service:', error);
    }
  }

  /**
   * Generate a response to a machine learning question
   */
  async generateMLResponse(message: string, userGrade: number = 10): Promise<ChatResponse> {
    // Initialize on first use
    if (!this.initializationAttempted) {
      this.initialize();
    }
    
    if (!this.isInitialized || !this.client) {
      return this.getFallbackResponse(message);
    }

    try {
      const systemPrompt = this.getSystemPrompt(userGrade);
      
      // Try different models in order of preference
      const models = ['gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'text-davinci-003'];
      let completion;
      let lastError;

      for (const model of models) {
        try {
          completion = await this.client.chat.completions.create({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            max_tokens: 500,
            temperature: 0.7,
            presence_penalty: 0.1,
            frequency_penalty: 0.1,
          });
          break; // Success, exit loop
        } catch (error: any) {
          lastError = error;
          if (error.status === 401 && error.message?.includes('insufficient permissions')) {
            logger.warn(`Model ${model} requires additional permissions, trying next model...`);
            continue; // Try next model
          } else {
            throw error; // Other errors should be thrown immediately
          }
        }
      }

      if (!completion) {
        throw lastError || new Error('All models failed');
      }

      const responseMessage = completion.choices[0]?.message?.content;
      
      if (!responseMessage) {
        throw new Error('No response generated');
      }

      return {
        message: responseMessage.trim(),
        confidence: 0.9,
        agentName: 'ML-E Tutor',
        metadata: {
          model: completion.model || 'gpt-3.5-turbo',
          tokens: completion.usage?.total_tokens || 0,
          topic: this.extractTopic(message),
        }
      };

    } catch (error: any) {
      if (error.status === 401 && error.message?.includes('insufficient permissions')) {
        logger.warn('OpenAI API key has insufficient permissions. Using fallback responses.');
        // Disable OpenAI for future requests to avoid repeated API calls
        this.isInitialized = false;
      } else {
        logger.error('OpenAI API error:', error);
      }
      return this.getFallbackResponse(message);
    }
  }

  /**
   * Get system prompt based on user grade level
   */
  private getSystemPrompt(grade: number): string {
    const gradeLevel = grade === 9 ? 'Grade 9' : 'Grade 10';
    
    return `You are ML-E, an AI tutor specializing in Machine Learning education for ${gradeLevel} students. 

Your role:
- Explain ML concepts clearly and appropriately for ${gradeLevel} level
- Use simple language and relatable examples
- Break down complex topics into digestible parts
- Encourage curiosity and learning
- Provide practical examples when possible
- Be supportive and patient

Guidelines:
- Keep responses concise but informative (2-4 paragraphs max)
- Use analogies and real-world examples
- Avoid overly technical jargon
- If a concept is too advanced, explain it simply or suggest prerequisites
- Always be encouraging and positive
- Focus on building understanding, not just giving answers

Topics you can help with:
- Supervised and Unsupervised Learning
- Machine Learning Algorithms (Decision Trees, Linear Regression, etc.)
- Data Processing and Analysis
- Real-world ML Applications
- Basic Statistics for ML
- Introduction to Neural Networks

If asked about topics outside ML, politely redirect to machine learning concepts.`;
  }

  /**
   * Extract the main topic from the user's message
   */
  private extractTopic(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    const topics = [
      'supervised learning',
      'unsupervised learning',
      'decision tree',
      'linear regression',
      'neural network',
      'deep learning',
      'classification',
      'clustering',
      'regression',
      'overfitting',
      'underfitting',
      'training data',
      'test data',
      'feature',
      'algorithm',
      'model',
      'prediction',
      'accuracy',
      'precision',
      'recall'
    ];

    for (const topic of topics) {
      if (lowerMessage.includes(topic)) {
        return topic;
      }
    }

    return 'general';
  }

  /**
   * Fallback response when OpenAI is not available
   */
  private getFallbackResponse(message: string): ChatResponse {
    const topic = this.extractTopic(message);
    
    const fallbackResponses: Record<string, string> = {
      'supervised learning': 'Supervised learning is like learning with a teacher! The algorithm learns from examples where we already know the correct answers. For example, showing the computer many photos labeled "cat" or "dog" so it can learn to identify cats and dogs in new photos.',
      
      'unsupervised learning': 'Unsupervised learning is like exploring without a guide. The algorithm tries to find hidden patterns in data without being told what to look for. It\'s like organizing your music collection by discovering that some songs sound similar, even without genre labels.',
      
      'decision tree': 'A decision tree is like a flowchart that helps make decisions by asking yes/no questions. Imagine deciding what to wear: "Is it raining? If yes, bring umbrella. If no, check temperature..." Each question leads to the next until you reach a decision.',
      
      'neural network': 'A neural network is inspired by how our brain works! It has artificial "neurons" connected together that can learn patterns. Think of it like a network of friends passing messages - each friend processes the message and passes it on, and together they can solve complex problems.',
      
      'general': `That's a great question about machine learning! ML is all about teaching computers to learn patterns from data, just like how you learn to recognize faces or predict your favorite pizza topping. 

The main idea is that instead of programming every possible scenario, we show the computer lots of examples and let it figure out the patterns. It's like learning to ride a bike - you don't memorize every possible situation, you learn the general principles through practice.

Would you like to explore any specific aspect of machine learning? I can explain concepts like supervised learning, algorithms, or real-world applications!`
    };

    return {
      message: fallbackResponses[topic] || fallbackResponses['general'],
      confidence: 0.7,
      agentName: 'ML-E Assistant',
      metadata: {
        model: 'fallback',
        tokens: 0,
        topic,
      }
    };
  }

  /**
   * Check if OpenAI service is available
   */
  isAvailable(): boolean {
    // Initialize on first check if not attempted
    if (!this.initializationAttempted) {
      this.initialize();
    }
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get service status
   */
  getStatus(): { available: boolean; model: string } {
    return {
      available: this.isAvailable(),
      model: this.isAvailable() ? 'gpt-3.5-turbo' : 'fallback'
    };
  }
}

export const openaiService = new OpenAIService();