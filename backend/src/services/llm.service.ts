import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export class LLMService {
  private openai: OpenAI | null = null;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.initializeProvider();
  }

  /**
   * Initialize the LLM provider
   */
  private initializeProvider(): void {
    try {
      if (this.config.provider === 'openai') {
        this.openai = new OpenAI({
          apiKey: this.config.apiKey
        });
        logger.info('OpenAI client initialized successfully');
      } else {
        throw new Error(`Provider ${this.config.provider} not yet implemented`);
      }
    } catch (error) {
      logger.error('Failed to initialize LLM provider:', error);
      throw error;
    }
  }

  /**
   * Generate completion using the configured LLM
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    try {
      if (this.config.provider === 'openai' && this.openai) {
        return await this.generateOpenAICompletion(request);
      } else {
        throw new Error(`Provider ${this.config.provider} not available`);
      }
    } catch (error) {
      logger.error('LLM completion failed:', error);
      throw error;
    }
  }

  /**
   * Generate completion using OpenAI
   */
  private async generateOpenAICompletion(request: LLMRequest): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    // Add conversation messages
    messages.push(...request.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    const completion = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      stream: false
    });

    const choice = completion.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error('No completion generated');
    }

    return {
      content: choice.message.content,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0
      },
      model: completion.model,
      finishReason: choice.finish_reason ?? 'unknown'
    };
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testRequest: LLMRequest = {
        messages: [
          { role: 'user', content: 'Hello, this is a health check.' }
        ],
        maxTokens: 10
      };

      await this.generateCompletion(testRequest);
      return true;
    } catch (error) {
      logger.error('LLM health check failed:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.provider || newConfig.apiKey) {
      this.initializeProvider();
    }
  }
}

/**
 * Create LLM service instance from environment variables
 */
export function createLLMService(): LLMService {
  const config: LLMConfig = {
    provider: 'openai',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1000'),
    apiKey: process.env.OPENAI_API_KEY || ''
  };

  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return new LLMService(config);
}