import { Router, Response } from 'express';
import { authenticateToken, validateQuery } from '../middleware/index.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { webSocketService } from '../services/websocket.service.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const sessionMessagesSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

/**
 * GET /api/websocket/session-messages
 * Get message history for a session
 */
router.get('/session-messages',
  authenticateToken,
  validateQuery(sessionMessagesSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, limit } = req.query as any;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      logger.info(`Retrieving session messages for user ${userId}, session ${sessionId}`);

      const messages = await webSocketService.getSessionMessages(sessionId);
      
      // Limit the number of messages returned
      const limitedMessages = messages.slice(-limit);

      res.json({
        success: true,
        data: {
          sessionId,
          messages: limitedMessages,
          totalCount: messages.length
        }
      });

    } catch (error) {
      logger.error('Error retrieving session messages:', error);
      res.status(500).json({
        error: 'Failed to retrieve session messages',
        message: 'Unable to load message history at this time.'
      });
    }
  }
);

/**
 * GET /api/websocket/connection-status
 * Get WebSocket connection status and statistics
 */
router.get('/connection-status',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const isConnected = webSocketService.isUserConnected(userId);
      const connectedUsersCount = webSocketService.getConnectedUsersCount();

      res.json({
        success: true,
        data: {
          isConnected,
          connectedUsersCount,
          userId,
          timestamp: new Date()
        }
      });

    } catch (error) {
      logger.error('Error getting connection status:', error);
      res.status(500).json({
        error: 'Failed to get connection status',
        message: 'Unable to retrieve connection information at this time.'
      });
    }
  }
);

/**
 * POST /api/websocket/send-notification
 * Send a notification to a specific user (admin/system use)
 */
router.post('/send-notification',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { targetUserId, message, type } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Validate input
      if (!targetUserId || !message || !type) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'targetUserId, message, and type are required'
        });
      }

      // For now, only allow users to send notifications to themselves
      // In a production system, you'd implement proper authorization
      if (targetUserId !== userId) {
        return res.status(403).json({
          error: 'Unauthorized',
          message: 'You can only send notifications to yourself'
        });
      }

      webSocketService.sendToUser(targetUserId, 'notification', {
        message,
        type,
        timestamp: new Date(),
        from: userId
      });

      logger.info(`Notification sent from ${userId} to ${targetUserId}: ${type}`);

      res.json({
        success: true,
        message: 'Notification sent successfully'
      });

    } catch (error) {
      logger.error('Error sending notification:', error);
      res.status(500).json({
        error: 'Failed to send notification',
        message: 'Unable to send notification at this time.'
      });
    }
  }
);

export { router as webSocketRoutes };