import {
    BedrockRuntimeClient,
    InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from '../utils/logger.js';

interface BedrockResponse {
    message: string;
    model: string;
    confidence: number;
    tokensUsed: {
        input: number;
        output: number;
    };
    responseTime: number;
    metadata: {
        topic?: string;
        complexity: 'simple' | 'medium' | 'complex';
        grade_level: number;
    };
}

export class BedrockService {
    private client: BedrockRuntimeClient;
    private models: {
        fast: string;
        balanced: string;
    };

    constructor() {
        this.models = {
            fast: process.env.BEDROCK_FAST_MODEL || 'anthropic.claude-3-haiku-20240307-v1:0',
            balanced: process.env.BEDROCK_BALANCED_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0'
        };

        this.client = new BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        logger.info('Bedrock service initialized', {
            region: process.env.AWS_REGION || 'us-east-1',
            models: this.models
        });
    }

    /**
     * Generate ML tutoring response using Bedrock
     */
    async generateMLResponse(
        question: string,
        userGrade: number = 10
    ): Promise<BedrockResponse> {
        const startTime = Date.now();

        try {
            // Determine complexity and select model
            const complexity = this.analyzeComplexity(question);
            const modelId = complexity === 'simple' ? this.models.fast : this.models.balanced;

            // Build educational prompt
            const prompt = this.buildPrompt(question, userGrade);

            // Invoke Bedrock
            const response = await this.invokeModel(modelId, prompt);

            const responseTime = Date.now() - startTime;

            logger.info('Bedrock response generated', {
                model: modelId,
                complexity,
                responseTime,
                tokensUsed: response.tokensUsed
            });

            return {
                message: response.content,
                model: modelId,
                confidence: 0.95,
                tokensUsed: response.tokensUsed,
                responseTime,
                metadata: {
                    topic: this.extractTopic(question),
                    complexity,
                    grade_level: userGrade
                }
            };

        } catch (error) {
            logger.error('Bedrock service error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to generate response: ${errorMessage}`);
        }
    }

    /**
     * Analyze question complexity
     */
    private analyzeComplexity(question: string): 'simple' | 'medium' | 'complex' {
        const complexKeywords = ['algorithm', 'optimization', 'gradient', 'backpropagation'];
        const mediumKeywords = ['neural network', 'deep learning', 'classification', 'regression'];

        const questionLower = question.toLowerCase();
        const wordCount = question.split(' ').length;

        if (complexKeywords.some(keyword => questionLower.includes(keyword)) || wordCount > 20) {
            return 'complex';
        }

        if (mediumKeywords.some(keyword => questionLower.includes(keyword)) || wordCount > 10) {
            return 'medium';
        }

        return 'simple';
    }

    /**
     * Build educational prompt
     */
    private buildPrompt(question: string, grade: number): string {
        const gradeContext = grade === 9
            ? "9th grade student with basic algebra knowledge"
            : "10th grade student with algebra and geometry knowledge";

        return `You are ML-E, an expert machine learning tutor for high school students.

STUDENT CONTEXT: ${gradeContext}

TEACHING GUIDELINES:
1. Use age-appropriate language and analogies
2. Break complex concepts into simple parts
3. Provide real-world examples
4. Be encouraging and supportive
5. Keep responses 200-400 words

QUESTION: ${question}

Provide a clear, engaging explanation that builds understanding progressively.`;
    }

    /**
     * Invoke Bedrock model
     */
    private async invokeModel(modelId: string, prompt: string): Promise<{
        content: string;
        tokensUsed: { input: number; output: number };
    }> {
        const requestBody = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1000,
            temperature: 0.7,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        };

        const command = new InvokeModelCommand({
            modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(requestBody)
        });

        const response = await this.client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        return {
            content: responseBody.content[0].text,
            tokensUsed: {
                input: responseBody.usage?.input_tokens || 0,
                output: responseBody.usage?.output_tokens || 0
            }
        };
    }

    /**
     * Extract topic for analytics
     */
    private extractTopic(question: string): string {
        const topicMap = {
            'supervised learning': ['supervised', 'classification', 'regression'],
            'neural networks': ['neural', 'network', 'neuron'],
            'deep learning': ['deep', 'cnn', 'rnn'],
            'machine learning basics': ['machine learning', 'ml', 'algorithm']
        };

        const questionLower = question.toLowerCase();

        for (const [topic, keywords] of Object.entries(topicMap)) {
            if (keywords.some(keyword => questionLower.includes(keyword))) {
                return topic;
            }
        }

        return 'general';
    }
}

export const bedrockService = new BedrockService();