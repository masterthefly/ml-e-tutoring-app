import { Router, Response } from 'express';
import { authenticateToken, validateRequest } from '../middleware/index.js';
import { AuthenticatedRequest } from '../types/auth.types.js';
import { UserModel } from '../database/schemas/user.schema.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().max(50).optional(),
  lastName: Joi.string().trim().max(50).optional(),
  learningInterests: Joi.array().items(Joi.string().trim().max(100)).max(10).optional(),
  preferences: Joi.object({
    learningPace: Joi.string().valid('slow', 'medium', 'fast').optional(),
    preferredExamples: Joi.array().items(Joi.string()).max(20).optional(),
    difficultyLevel: Joi.number().min(1).max(10).optional()
  }).optional()
});

/**
 * GET /api/profile
 * Get current user's profile
 */
router.get('/',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const user = await UserModel.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        data: user.toJSON()
      });

    } catch (error) {
      logger.error('Error retrieving user profile:', error);
      res.status(500).json({
        error: 'Failed to retrieve profile',
        message: 'Unable to load profile information at this time.'
      });
    }
  }
);

/**
 * PUT /api/profile
 * Update user's profile
 */
router.put('/',
  authenticateToken,
  validateRequest(updateProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { firstName, lastName, learningInterests, preferences } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const updateData: any = {};
      
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (learningInterests !== undefined) updateData.learningInterests = learningInterests;
      if (preferences !== undefined) {
        updateData.preferences = preferences;
      }

      // Mark profile as completed if basic info is provided
      if (firstName && lastName) {
        updateData.profileCompleted = true;
      }

      const user = await UserModel.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`Profile updated for user ${userId}`, {
        hasFirstName: !!firstName,
        hasLastName: !!lastName,
        interestsCount: learningInterests?.length || 0,
        profileCompleted: user.profileCompleted
      });

      res.json({
        success: true,
        data: user.toJSON(),
        message: 'Profile updated successfully'
      });

    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({
        error: 'Failed to update profile',
        message: 'Unable to save profile changes at this time.'
      });
    }
  }
);

/**
 * GET /api/profile/interests/suggestions
 * Get suggested learning interests based on ML topics
 */
router.get('/interests/suggestions',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const suggestions = [
        'Supervised Learning',
        'Unsupervised Learning',
        'Neural Networks',
        'Deep Learning',
        'Computer Vision',
        'Natural Language Processing',
        'Reinforcement Learning',
        'Decision Trees',
        'Linear Regression',
        'Clustering Algorithms',
        'Data Preprocessing',
        'Feature Engineering',
        'Model Evaluation',
        'Overfitting & Underfitting',
        'Cross Validation',
        'Ensemble Methods',
        'Time Series Analysis',
        'Recommendation Systems',
        'AI Ethics',
        'Machine Learning Applications'
      ];

      res.json({
        success: true,
        data: suggestions
      });

    } catch (error) {
      logger.error('Error retrieving interest suggestions:', error);
      res.status(500).json({
        error: 'Failed to retrieve suggestions',
        message: 'Unable to load interest suggestions at this time.'
      });
    }
  }
);

export { router as profileRoutes };