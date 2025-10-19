import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/index.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { analyticsService } from '../services/analytics.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/analytics/dashboard
 * Get comprehensive learning analytics for dashboard
 */
router.get('/dashboard',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const days = parseInt(req.query.days as string) || 30;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const analytics = await analyticsService.getUserAnalytics(userId, days);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Error retrieving analytics dashboard:', error);
      res.status(500).json({
        error: 'Failed to retrieve analytics',
        message: 'Unable to load analytics data at this time.'
      });
    }
  }
);

/**
 * GET /api/analytics/topics
 * Get progress analytics for specific topics
 */
router.get('/topics',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const topicIds = req.query.topicIds as string[];

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const topicProgress = await analyticsService.getTopicProgress(userId, topicIds);

      res.json({
        success: true,
        data: topicProgress
      });

    } catch (error) {
      logger.error('Error retrieving topic analytics:', error);
      res.status(500).json({
        error: 'Failed to retrieve topic analytics',
        message: 'Unable to load topic progress data at this time.'
      });
    }
  }
);

/**
 * POST /api/analytics/session/start
 * Start tracking a new learning session
 */
router.post('/session/start',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { sessionId, difficultyLevel } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      await analyticsService.startSession({
        userId,
        sessionId,
        difficultyLevel
      });

      res.json({
        success: true,
        message: 'Learning session started'
      });

    } catch (error) {
      logger.error('Error starting analytics session:', error);
      res.status(500).json({
        error: 'Failed to start session tracking',
        message: 'Unable to initialize session analytics.'
      });
    }
  }
);

/**
 * POST /api/analytics/session/end
 * End tracking a learning session
 */
router.post('/session/end',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, topicsDiscussed, conceptsLearned } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      await analyticsService.endSession(sessionId, topicsDiscussed, conceptsLearned);

      res.json({
        success: true,
        message: 'Learning session ended'
      });

    } catch (error) {
      logger.error('Error ending analytics session:', error);
      res.status(500).json({
        error: 'Failed to end session tracking',
        message: 'Unable to finalize session analytics.'
      });
    }
  }
);

/**
 * POST /api/analytics/progress
 * Track progress on a specific topic
 */
router.post('/progress',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const {
        sessionId,
        topicId,
        topicName,
        action,
        progressPercentage,
        timeSpent,
        difficultyLevel,
        masteryLevel,
        metadata
      } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Validate required fields
      if (!sessionId || !topicId || !topicName || !action || progressPercentage === undefined) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'sessionId, topicId, topicName, action, and progressPercentage are required'
        });
      }

      await analyticsService.trackProgress({
        userId,
        sessionId,
        topicId,
        topicName,
        action,
        progressPercentage,
        timeSpent: timeSpent || 0,
        difficultyLevel: difficultyLevel || 5,
        masteryLevel: masteryLevel || 'beginner',
        metadata
      });

      res.json({
        success: true,
        message: 'Progress tracked successfully'
      });

    } catch (error) {
      logger.error('Error tracking progress:', error);
      res.status(500).json({
        error: 'Failed to track progress',
        message: 'Unable to record learning progress.'
      });
    }
  }
);

/**
 * POST /api/analytics/activity
 * Update session activity (messages, questions)
 */
router.post('/activity',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId, messageCount, questionCount } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      await analyticsService.updateSessionActivity(sessionId, messageCount, questionCount);

      res.json({
        success: true,
        message: 'Activity updated'
      });

    } catch (error) {
      logger.error('Error updating session activity:', error);
      res.status(500).json({
        error: 'Failed to update activity',
        message: 'Unable to record session activity.'
      });
    }
  }
);

export { router as analyticsRoutes };