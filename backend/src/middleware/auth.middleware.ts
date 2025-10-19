import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { AuthenticatedRequest, JWTPayload } from '../types/auth.types.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ 
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
      return;
    }

    const payload = authService.verifyToken(token);
    
    // Verify user still exists
    const user = await authService.getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Attach user info to request
    req.user = payload;
    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
        return;
      }
      
      if (error.message.includes('invalid')) {
        res.status(401).json({ 
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
        return;
      }
    }

    res.status(401).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = authService.verifyToken(token);
      const user = await authService.getUserById(payload.userId);
      
      if (user) {
        req.user = payload;
      }
    }
    
    next();
  } catch (error) {
    // Silently continue without authentication
    logger.warn('Optional auth failed:', error);
    next();
  }
};

/**
 * Middleware to check if user has required grade level
 */
export const requireGrade = (grades: (9 | 10)[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!grades.includes(req.user.grade)) {
      res.status(403).json({ 
        error: `Access restricted to grades: ${grades.join(', ')}`,
        code: 'GRADE_RESTRICTED'
      });
      return;
    }

    next();
  };
};