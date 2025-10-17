import { Router, Response } from 'express';
import { sessionService } from '../services/session.service.js';
import { AuthenticatedRequest, SessionCreateRequest, SessionSyncData } from '../types/index.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const createSessionSchema = Joi.object({
  initialTopic: Joi.string().optional()
});

const syncAgentStateSchema = Joi.object({
  agentId: Joi.string().required(),
  agentType: Joi.string().valid('coordinator', 'tutor', 'assessment', 'content').required(),
  state: Joi.object().required()
});

/**
 * POST /api/sessions
 * Create a new learning session
 */
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Validate request body
    const { error, value } = createSessionSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
      return;
    }

    const createRequest: SessionCreateRequest = {
      userId: req.user.userId,
      initialTopic: value.initialTopic
    };

    const session = await sessionService.createSession(createRequest);

    res.status(201).json({
      message: 'Session created successfully',
      data: { session }
    });
  } catch (error) {
    logger.error('Create session endpoint error:', error);
    res.status(500).json({
      error: 'Failed to create session'
    });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get session by ID
 */
router.get('/:sessionId', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { sessionId } = req.params;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'Session not found'
      });
      return;
    }

    // Verify user owns the session
    if (session.userId !== req.user.userId) {
      res.status(403).json({
        error: 'Access denied'
      });
      return;
    }

    res.json({
      message: 'Session retrieved successfully',
      data: { session }
    });
  } catch (error) {
    logger.error('Get session endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session'
    });
  }
});

/**
 * GET /api/sessions
 * Get active sessions for the authenticated user
 */
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const sessions = await sessionService.getUserActiveSessions(req.user.userId);

    res.json({
      message: 'Active sessions retrieved successfully',
      data: { sessions }
    });
  } catch (error) {
    logger.error('Get user sessions endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions'
    });
  }
});

/**
 * POST /api/sessions/:sessionId/sync
 * Synchronize agent state
 */
router.post('/:sessionId/sync', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { sessionId } = req.params;

    // Validate request body
    const { error, value } = syncAgentStateSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
      return;
    }

    // Verify session exists and user owns it
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Session not found'
      });
      return;
    }

    if (session.userId !== req.user.userId) {
      res.status(403).json({
        error: 'Access denied'
      });
      return;
    }

    const syncData: SessionSyncData = {
      sessionId,
      agentId: value.agentId,
      agentType: value.agentType,
      state: value.state,
      timestamp: new Date()
    };

    await sessionService.syncAgentState(syncData);

    res.json({
      message: 'Agent state synchronized successfully'
    });
  } catch (error) {
    logger.error('Sync agent state endpoint error:', error);
    res.status(500).json({
      error: 'Failed to sync agent state'
    });
  }
});

/**
 * GET /api/sessions/:sessionId/agents/:agentId
 * Get agent state for a specific agent in a session
 */
router.get('/:sessionId/agents/:agentId', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { sessionId, agentId } = req.params;

    // Verify session exists and user owns it
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Session not found'
      });
      return;
    }

    if (session.userId !== req.user.userId) {
      res.status(403).json({
        error: 'Access denied'
      });
      return;
    }

    const agentState = await sessionService.getAgentState(sessionId, agentId);

    if (!agentState) {
      res.status(404).json({
        error: 'Agent state not found'
      });
      return;
    }

    res.json({
      message: 'Agent state retrieved successfully',
      data: { agentState }
    });
  } catch (error) {
    logger.error('Get agent state endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve agent state'
    });
  }
});

/**
 * DELETE /api/sessions/:sessionId
 * End a session
 */
router.delete('/:sessionId', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { sessionId } = req.params;

    // Verify session exists and user owns it
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Session not found'
      });
      return;
    }

    if (session.userId !== req.user.userId) {
      res.status(403).json({
        error: 'Access denied'
      });
      return;
    }

    await sessionService.endSession(sessionId);

    res.json({
      message: 'Session ended successfully'
    });
  } catch (error) {
    logger.error('End session endpoint error:', error);
    res.status(500).json({
      error: 'Failed to end session'
    });
  }
});

export { router as sessionRoutes };