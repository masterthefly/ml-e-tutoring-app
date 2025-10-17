import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { LoginRequest, RegisterRequest, AuthenticatedRequest } from '../types/auth.types.js';
import { authenticateToken, validateRequest, authRateLimit } from '../middleware/index.js';
import { logger } from '../utils/logger.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  grade: Joi.number().valid(9, 10).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', 
  authRateLimit,
  validateRequest(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const userData: RegisterRequest = req.body;

    // Validate password strength
    const passwordValidation = authService.validatePassword(userData.password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    const result = await authService.register(userData);

    res.status(201).json({
      message: 'User registered successfully',
      data: result
    });
  } catch (error) {
    logger.error('Registration endpoint error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('already')) {
        res.status(409).json({
          error: error.message
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Registration failed'
    });
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', 
  authRateLimit,
  validateRequest(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const credentials: LoginRequest = req.body;
    const result = await authService.login(credentials);

    res.json({
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    logger.error('Login endpoint error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid')) {
      res.status(401).json({
        error: 'Invalid email or password'
      });
      return;
    }

    res.status(500).json({
      error: 'Login failed'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', 
  validateRequest(refreshTokenSchema),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Token refresh endpoint error:', error);
    
    res.status(401).json({
      error: 'Invalid refresh token'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'User not authenticated'
      });
      return;
    }

    const user = await authService.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({
        error: 'User not found'
      });
      return;
    }

    res.json({
      message: 'User profile retrieved successfully',
      data: {
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          grade: user.grade,
          createdAt: user.createdAt,
          lastActive: user.lastActive,
          preferences: user.preferences
        }
      }
    });
  } catch (error) {
    logger.error('Get profile endpoint error:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve user profile'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // In a JWT-based system, logout is typically handled client-side
    // by removing the token. This endpoint exists for consistency
    // and potential future server-side token blacklisting.
    
    logger.info(`User logged out: ${req.user?.email}`);
    
    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout endpoint error:', error);
    
    res.status(500).json({
      error: 'Logout failed'
    });
  }
});

export { router as authRoutes };