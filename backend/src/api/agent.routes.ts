import { Router, Response } from 'express';
import { authenticateToken, validateRequest, chatRateLimit } from '../middleware/index.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { bedrockService } from '../services/bedrock.service.js';
import { authService } from '../services/auth.service.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const chatMessageSchema = Joi.object({
  message: Joi.string().required().max(1000),
  sessionId: Joi.string().uuid().optional(),
  context: Joi.object().optional()
});

const topicQuerySchema = Joi.object({
  topic: Joi.string().required().max(100),
  difficulty: Joi.string().valid('beginner', 'intermediate', 'advanced').optional(),
  sessionId: Joi.string().uuid().optional()
});

/**
 * POST /api/agents/chat
 * Send a message to the multi-agent system
 */
router.post('/chat', 
  authenticateToken,
  chatRateLimit,
  validateRequest(chatMessageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { message, sessionId, context } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      logger.info(`Chat message received from user ${userId}`, { 
        messageLength: message.length,
        sessionId 
      });

      // Get user info for personalized response
      let userGrade = 10; // default
      try {
        const user = await authService.getUserById(userId);
        if (user) {
          userGrade = user.grade;
        }
      } catch (error) {
        logger.warn('Could not fetch user grade, using default:', error instanceof Error ? error.message : String(error));
      }

      // Generate intelligent response using AWS Bedrock
      const agentResponse = await bedrockService.generateMLResponse(message, userGrade);

      const response = {
        message: agentResponse.message,
        agentName: agentResponse.agentName,
        sessionId: sessionId || `session_${Date.now()}`,
        timestamp: new Date(),
        confidence: agentResponse.confidence,
        metadata: agentResponse.metadata
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error processing chat message:', error);
      res.status(500).json({
        error: 'Failed to process message',
        message: 'An error occurred while processing your message. Please try again.'
      });
    }
  }
);

/**
 * POST /api/agents/topic
 * Request information about a specific ML topic
 */
router.post('/topic',
  authenticateToken,
  validateRequest(topicQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { topic, difficulty, sessionId } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      logger.info(`Topic query received from user ${userId}`, { topic, difficulty });

      // Mock topic query response for now
      const response = {
        topic,
        difficulty: difficulty || 'beginner',
        content: `Here's information about ${topic} at ${difficulty || 'beginner'} level. The content agent is being implemented.`,
        examples: [],
        nextTopics: [],
        sessionId: sessionId || `session_${Date.now()}`
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error processing topic query:', error);
      res.status(500).json({
        error: 'Failed to process topic query',
        message: 'An error occurred while retrieving topic information. Please try again.'
      });
    }
  }
);

/**
 * GET /api/agents/status
 * Get the status of all agents in the system
 */
router.get('/status',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Mock system status for now
      const agentStatus = {
        isRunning: true,
        totalAgents: 4,
        activeAgents: 4,
        agentsByType: {
          coordinator: 1,
          tutor: 1,
          assessment: 1,
          content: 1
        },
        timestamp: new Date()
      };

      res.json({
        success: true,
        data: agentStatus
      });

    } catch (error) {
      logger.error('Error getting agent status:', error);
      res.status(500).json({
        error: 'Failed to get agent status',
        message: 'Unable to retrieve system status at this time.'
      });
    }
  }
);

/**
 * POST /api/agents/assessment
 * Submit an assessment response
 */
router.post('/assessment',
  authenticateToken,
  validateRequest(Joi.object({
    questionId: Joi.string().required(),
    answer: Joi.string().required().max(500),
    sessionId: Joi.string().uuid().optional()
  })),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { questionId, answer, sessionId } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      logger.info(`Assessment response received from user ${userId}`, { questionId });

      // Mock assessment response for now
      const response = {
        questionId,
        isCorrect: Math.random() > 0.5, // Random for demo
        feedback: `Your answer "${answer}" has been processed. The assessment agent is being implemented.`,
        score: Math.floor(Math.random() * 100),
        nextQuestion: null,
        sessionId: sessionId || `session_${Date.now()}`
      };

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error processing assessment:', error);
      res.status(500).json({
        error: 'Failed to process assessment',
        message: 'An error occurred while processing your assessment. Please try again.'
      });
    }
  }
);

export { router as agentRoutes };