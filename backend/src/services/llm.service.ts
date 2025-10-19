import { bedrockService } from './bedrock.service.js';
import { logger } from '../utils/logger.js';

export interface LLMConfig {
  provider: 'bedrock';
  model: string;
  temperature: number;
  maxTokens: number;
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
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    logger.info('LLM service initialized with Bedrock provider');
  }

  /**
   * Generate completion using AWS Bedrock
   */
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    try {
      // Convert LLM request to Bedrock format
      const prompt = this.buildPrompt(request);
      
      // Use Bedrock service for generation
      const bedrockResponse = await bedrockService.generateMLResponse(prompt, 10);
      
      return {
        content: bedrockResponse.message,
        usage: {
          promptTokens: bedrockResponse.tokensUsed.input,
          completionTokens: bedrockResponse.tokensUsed.output,
          totalTokens: bedrockResponse.tokensUsed.input + bedrockResponse.tokensUsed.output
        },
        model: bedrockResponse.model,
        finishReason: 'stop'
      };
    } catch (error) {
      logger.error('LLM completion failed:', error);
      throw error;
    }
  }

  /**
   * Build prompt from LLM request
   */
  private buildPrompt(request: LLMRequest): string {
    let prompt = '';
    
    if (request.systemPrompt) {
      prompt += `System: ${request.systemPrompt}\n\n`;
    }
    
    for (const message of request.messages) {
      if (message.role === 'user') {
        prompt += `Human: ${message.content}\n\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n\n`;
      }
    }
    
    return prompt.trim();
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
  }
}

/**
 * Create LLM service instance for Bedrock
 */
export function createLLMService(): LLMService {
  const config: LLMConfig = {
    provider: 'bedrock',
    model: process.env.BEDROCK_BALANCED_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1000')
  };

  return new LLMService(config);
}